// PWA/index freshness guards for GRQ FX Validation Dashboard
// Australian English: these tests prevent regressions where the date dropdown
// becomes stuck on an old `index.json` due to service worker caching issues.
//
// Date: 31-Dec-2025

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const DOCS_DIR = path.join(REPO_ROOT, "docs");

function listPredictionDateDirs() {
  const entries = fs.readdirSync(DOCS_DIR, { withFileTypes: true });
  const dateDirs = entries
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .sort(); // lexicographic sort works for YYYY-MM-DD

  return dateDirs;
}

test("`docs/index.json` includes the latest prediction date folder", () => {
  const dateDirs = listPredictionDateDirs();
  assert.ok(dateDirs.length > 0, "Expected at least one dated folder in docs/");

  const latestDateDir = dateDirs[dateDirs.length - 1];
  const indexPath = path.join(DOCS_DIR, "index.json");
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));

  assert.ok(
    index && typeof index === "object",
    "index.json should parse to an object",
  );
  assert.ok(
    index.entries && typeof index.entries === "object",
    "index.json should contain an entries object",
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(index.entries, latestDateDir),
    `index.json is missing the latest date directory: ${latestDateDir}`,
  );
});

test("Service worker treats `index.json` as network-first (pathname-based)", () => {
  const swPath = path.join(DOCS_DIR, "sw.js");
  const sw = fs.readFileSync(swPath, "utf8");

  // We want pathname matching, e.g. `/GRQ-FX-validation/index.json` → match.
  // A common bug is matching `./index.json`, which never matches URL.pathname.
  assert.ok(
    sw.includes("/\\/index\\.json$/"),
    "Expected sw.js to include pathname regex /\\/index\\.json$/ for index.json",
  );
  assert.ok(
    !sw.includes("\\.\\/index\\.json$"),
    "sw.js still appears to match './index.json' which does not match URL.pathname",
  );
});

test("`docs/sw-register.js` has a valid service worker registration call (no broken string)", () => {
  // Issue #23: the inline SW registration block was extracted out of
  // docs/index.html into docs/sw-register.js so the page can ship a strict
  // CSP without 'unsafe-inline' on script-src. The sanity check now runs
  // against the extracted file. docs/index.html must still reference it.
  const htmlPath = path.join(DOCS_DIR, "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  assert.match(
    html,
    /<script[^>]*\bsrc\s*=\s*["']sw-register\.js[^"']*["']/i,
    "Expected docs/index.html to reference sw-register.js via <script src=...>",
  );

  const swRegisterPath = path.join(DOCS_DIR, "sw-register.js");
  const swRegister = fs.readFileSync(swRegisterPath, "utf8");

  // Basic sanity check to catch a missing quote/paren which prevents SW updates.
  assert.match(
    swRegister,
    /navigator\.serviceWorker\.register\(\s*['"]\.\/sw\.js\?v=[^'"]+['"]\s*\)\s*\.then\(/,
    "Expected a complete navigator.serviceWorker.register('./sw.js?v=...').then(...) call",
  );
});

test("Service worker treats predictions.json and CSV data files as dynamic (pathname-based)", () => {
  const swPath = path.join(DOCS_DIR, "sw.js");
  const sw = fs.readFileSync(swPath, "utf8");

  // These patterns must match URL.pathname, which starts with `/...`.
  // Issue #30: the earlier assertions used JavaScript string escapes that
  // collapsed every `\/` to `/`, so `sw.includes("/\/data\/.*\.csv$/")`
  // was actually checking for `//data/.*.csv$/` — a substring that can
  // never appear in a regex literal. Use raw strings (no `\`) so the
  // check is what it looks like.
  assert.ok(
    sw.includes("/\\/data\\/.*\\.csv$/"),
    String.raw`Expected sw.js to include pathname regex /\/data\/.*\.csv$/ for CSV data files`,
  );
  assert.ok(
    sw.includes("/\\/\\d{4}-\\d{2}-\\d{2}\\/predictions\\.json$/"),
    "Expected sw.js to include pathname regex for dated predictions.json files",
  );

  // Guard against the common broken form using `./...` which never matches pathname.
  assert.ok(
    !sw.includes("/\\.\\/data\\//"),
    "sw.js still appears to contain './data/' regex patterns which do not match URL.pathname",
  );
});

test("Service worker does not treat predictions.json as a static JSON asset", () => {
  const swPath = path.join(DOCS_DIR, "sw.js");
  const sw = fs.readFileSync(swPath, "utf8");

  // Predictions JSON must not be captured by the cache-first static asset path.
  // sw.js currently writes the guard with double-quoted ".json", so match that.
  assert.ok(
    sw.includes('endsWith(".json") && !isNetworkFirst && !isDataFile'),
    "Expected sw.js to exclude dynamic data JSON from the static asset .json matcher",
  );
});

// Issue #30 regression guard: the dashboard auto-selects the most recent
// entry in index.json on load and immediately fetches its predictions.json.
// If that file is missing, malformed, or empty the screen shows
// "Failed to load prediction data" — exactly what the issue screenshot
// captured. This test catches the deploy-time inconsistency.
test("Every index.json entry resolves to a valid predictions.json with results", () => {
  const indexPath = path.join(DOCS_DIR, "index.json");
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));

  assert.ok(
    index.entries && typeof index.entries === "object",
    "index.json should contain an entries object",
  );

  const problems = [];
  for (const [key, entry] of Object.entries(index.entries)) {
    if (typeof entry.file !== "string" || entry.file.length === 0) {
      problems.push(`${key}: missing 'file' property`);
      continue;
    }
    const filePath = path.join(DOCS_DIR, entry.file);
    if (!fs.existsSync(filePath)) {
      problems.push(`${key}: file does not exist (${entry.file})`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
      problems.push(`${key}: invalid JSON in ${entry.file} (${err.message})`);
      continue;
    }
    if (!parsed || typeof parsed !== "object") {
      problems.push(`${key}: ${entry.file} did not parse to an object`);
      continue;
    }
    if (!Array.isArray(parsed.results) || parsed.results.length === 0) {
      problems.push(`${key}: ${entry.file} has no non-empty 'results' array`);
      continue;
    }
    if (typeof parsed.date !== "string" || parsed.date !== key) {
      problems.push(
        `${key}: ${entry.file} 'date' property (${parsed.date}) does not match the index key`,
      );
    }
  }

  assert.equal(
    problems.length,
    0,
    `Found ${problems.length} broken index.json entries:\n  ${
      problems.join("\n  ")
    }`,
  );
});
