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

test("`docs/index.html` has a valid service worker registration call (no broken string)", () => {
  const htmlPath = path.join(DOCS_DIR, "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");

  // Basic sanity check to catch a missing quote/paren which prevents SW updates.
  assert.match(
    html,
    /navigator\.serviceWorker\.register\(\s*['"]\.\/sw\.js\?v=[^'"]+['"]\s*\)\s*\.then\(/,
    "Expected a complete navigator.serviceWorker.register('./sw.js?v=...').then(...) call",
  );
});

test("Service worker treats predictions.json and CSV data files as dynamic (pathname-based)", () => {
  const swPath = path.join(DOCS_DIR, "sw.js");
  const sw = fs.readFileSync(swPath, "utf8");

  // These patterns must match URL.pathname, which starts with `/...`.
  assert.ok(
    sw.includes("/\/data\/.*\.csv$/"),
    "Expected sw.js to include pathname regex /\/data\/.*\.csv$/ for CSV data files",
  );
  assert.ok(
    sw.includes("/\/\d{4}-\d{2}-\d{2}\/predictions\.json$/"),
    "Expected sw.js to include pathname regex for dated predictions.json files",
  );

  // Guard against the common broken form using `./...` which never matches pathname.
  assert.ok(
    !sw.includes("\.\/data\/"),
    "sw.js still appears to contain './data/' patterns which do not match URL.pathname",
  );
});

test("Service worker does not treat predictions.json as a static JSON asset", () => {
  const swPath = path.join(DOCS_DIR, "sw.js");
  const sw = fs.readFileSync(swPath, "utf8");

  // Predictions JSON must not be captured by the cache-first static asset path.
  assert.ok(
    sw.includes("endsWith('.json') && !isNetworkFirst && !isDataFile"),
    "Expected sw.js to exclude dynamic data JSON from the static asset .json matcher",
  );
});
