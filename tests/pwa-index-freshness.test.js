// PWA/index freshness guards for GRQ FX Validation Dashboard
// Australian English: these tests prevent regressions where the date dropdown
// becomes stuck on an old `index.json` due to service worker caching issues.
//
// Date: 31-Dec-2025

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

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

// Issue #43: the previous source-grep guards for SW pathname matching
// (network-first index.json, CSV data, dated predictions.json,
// static-asset .json exclusion) were HOW-tests — they passed when the
// regex literal happened to appear in `docs/sw.js`, regardless of
// whether the SW actually routed requests correctly. They have been
// replaced by `tests/sw-pathname-guards.test.ts`, which loads sw.js
// into a mocked Service Worker scope, dispatches synthetic fetch
// events, and asserts on the observable strategy (network-only,
// network-first, cache-first) each request receives.
//
// Run the behavioural suite with:
//
//   deno test --allow-read tests/sw-pathname-guards.test.ts
//
// This test verifies the behavioural suite exists so a careless
// `git rm` cannot silently drop the runtime coverage.
//
// Issue #93: this test previously also grep'd the sibling suite's source
// for a `dispatchFetch(` token to "prove" it dispatches synthetic fetch
// events. That was a source-grep HOW-test — the substring's presence
// does not prove the suite dispatches anything (it could sit in a
// comment or a renamed no-op). The real signal that the runtime
// behaviour is covered is `sw-pathname-guards.test.ts` running green in
// the Deno gate, so only the anti-deletion `existsSync` guard remains.
test("Service worker runtime behaviour suite (sw-pathname-guards.test.ts) exists", () => {
  const behaviouralPath = path.join(
    REPO_ROOT,
    "tests",
    "sw-pathname-guards.test.ts",
  );
  assert.ok(
    fs.existsSync(behaviouralPath),
    `Expected ${behaviouralPath} to exist as the runtime replacement for the deleted source-grep tests`,
  );
});

test("`docs/index.html` references the extracted sw-register.js script", () => {
  // Issue #23: the inline SW registration block was extracted out of
  // docs/index.html into docs/sw-register.js so the page can ship a strict
  // CSP without 'unsafe-inline' on script-src. docs/index.html must still
  // reference it.
  const htmlPath = path.join(DOCS_DIR, "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  assert.match(
    html,
    /<script[^>]*\bsrc\s*=\s*["']sw-register\.js[^"']*["']/i,
    "Expected docs/index.html to reference sw-register.js via <script src=...>",
  );
});

// Issue #93: this used to grep sw-register.js source text for a
// `navigator.serviceWorker.register('./sw.js?v=...').then(...)` literal —
// a HOW-test that passed whenever the literal appeared (even in a
// comment) and broke on harmless refactors. It is now a WHAT-test: load
// sw-register.js into a scope with a stubbed `navigator.serviceWorker`,
// fire the `load` event, and assert `register` was actually invoked with
// a versioned `./sw.js?v=…` URL and a `.then` handler attached —
// exercising the registration behaviour directly.
test("`docs/sw-register.js` registers ./sw.js?v=… and attaches a .then handler", () => {
  const swRegisterPath = path.join(DOCS_DIR, "sw-register.js");
  const src = fs.readFileSync(swRegisterPath, "utf8");

  const registerCalls = [];
  let thenAttached = false;

  // A thenable standing in for the promise returned by register(). We
  // only observe that a fulfilment handler is attached; we do not run it
  // (the success path wires up update polling we are not asserting on).
  const registrationPromise = {
    then(onFulfilled) {
      thenAttached = typeof onFulfilled === "function";
      return { catch() {} };
    },
  };

  const navigatorStub = {
    serviceWorker: {
      register(url) {
        registerCalls.push(url);
        return registrationPromise;
      },
      addEventListener() {},
      controller: null,
    },
  };

  let loadHandler = null;
  const windowStub = {
    addEventListener(type, fn) {
      if (type === "load") loadHandler = fn;
    },
    location: { reload() {} },
  };

  const sandbox = {
    navigator: navigatorStub,
    window: windowStub,
    console: { log() {} },
    setInterval() {
      return 0;
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);

  // The IIFE only wires up registration when serviceWorker is present,
  // and defers it to the window `load` event.
  assert.equal(
    typeof loadHandler,
    "function",
    "Expected sw-register.js to attach a window 'load' handler",
  );

  // Firing 'load' is what triggers the actual registration call.
  loadHandler();

  assert.equal(
    registerCalls.length,
    1,
    "Expected exactly one navigator.serviceWorker.register call on load",
  );
  assert.match(
    registerCalls[0],
    /^\.\/sw\.js\?v=.+/,
    "Expected register to be called with a versioned ./sw.js?v=… URL",
  );
  assert.ok(
    thenAttached,
    "Expected a .then fulfilment handler attached to the registration promise",
  );
});

// Issue #43: the previous "predictions.json / CSV dynamic" and "static
// .json exclusion" assertions were source-grep HOW-tests. The runtime
// equivalents now live in `tests/sw-pathname-guards.test.ts` —
// specifically the tests:
//   • "sw.js routes CSV data files under /data/ to network-only ..."
//   • "sw.js routes dated predictions.json to network-only ..."
//   • "sw.js routes static .json assets ... cache-first, not network-only"
// which dispatch real fetch events and observe the strategy used,
// rather than asserting on the source text of `docs/sw.js`.

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
