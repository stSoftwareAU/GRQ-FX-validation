// Header banner theme-aware tests (issue #44).
//
// The top `.card-header.header-gradient` previously hard-coded a purple
// gradient and `color: white !important`, so it stayed purple regardless
// of the active theme. Issue #44 asks for the header to respond to the
// three theme states the toggle drives:
//
//   * light forced  → body.light-mode-forced
//   * dark forced   → body.dark-mode-forced
//   * auto + system dark → @media (prefers-color-scheme: dark)
//                          body:not(.dark-mode-forced)
//
// These tests load docs/styles.css and assert that each of the three
// states ships a `.header-gradient` override block. They mirror the
// shape of tests/dark-mode-emoji.test.js.
//
// Australian English: behaviour, colour, organisation.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const STYLES_CSS = path.join(REPO_ROOT, "docs", "styles.css");
const INDEX_HTML = path.join(REPO_ROOT, "docs", "index.html");

function readStyles() {
  return fs.readFileSync(STYLES_CSS, "utf8");
}

// Find a CSS rule whose selector matches `selectorRe` and return the
// body of the first matching declaration block. Brace-walks so nested
// blocks (e.g. inside an @media) are captured correctly.
function extractBlock(src, selectorRe) {
  const m = src.match(selectorRe);
  if (!m) return null;
  let i = src.indexOf("{", m.index + m[0].length - 1);
  if (i === -1) return null;
  let depth = 0;
  const start = i;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start + 1, i);
    }
  }
  return null;
}

test("header-gradient: light-mode-forced override exists with theme colours", () => {
  const src = readStyles();
  const body = extractBlock(
    src,
    /body\.light-mode-forced\s+\.header-gradient\s*\{/,
  );
  assert.ok(
    body,
    "expected a `body.light-mode-forced .header-gradient` override block",
  );
  assert.match(
    body,
    /background/i,
    "light override should set a background",
  );
  assert.match(body, /color\s*:/i, "light override should set a text colour");
});

test("header-gradient: light-mode-forced overrides h1 and p text colour", () => {
  const src = readStyles();
  const body = extractBlock(
    src,
    /body\.light-mode-forced\s+\.header-gradient\s+h1\s*,\s*body\.light-mode-forced\s+\.header-gradient\s+p\s*\{/,
  );
  assert.ok(
    body,
    "expected light-mode `.header-gradient h1, .header-gradient p` rule",
  );
  assert.match(body, /color\s*:/i, "light h1/p rule must set a colour");
});

test("header-gradient: dark-mode-forced override exists with theme colours", () => {
  const src = readStyles();
  const body = extractBlock(
    src,
    /body\.dark-mode-forced\s+\.header-gradient\s*\{/,
  );
  assert.ok(
    body,
    "expected a `body.dark-mode-forced .header-gradient` override block",
  );
  assert.match(body, /background/i, "dark override should set a background");
  assert.match(body, /color\s*:/i, "dark override should set a text colour");
});

test("header-gradient: dark-mode-forced overrides h1 and p text colour", () => {
  const src = readStyles();
  const body = extractBlock(
    src,
    /body\.dark-mode-forced\s+\.header-gradient\s+h1\s*,\s*body\.dark-mode-forced\s+\.header-gradient\s+p\s*\{/,
  );
  assert.ok(
    body,
    "expected dark-mode `.header-gradient h1, .header-gradient p` rule",
  );
  assert.match(body, /color\s*:/i, "dark h1/p rule must set a colour");
});

// Issue #67 added a `:not(.light-mode-forced)` guard to the auto+system-dark
// selectors so they no longer match when the user has forced LIGHT mode.
// The regexes below allow that optional extra `:not(…)` qualifier.
const NOT_DARK = String.raw`body:not\(\.dark-mode-forced\)(?::not\([^)]*\))?`;

test("header-gradient: auto+system-dark override exists", () => {
  const src = readStyles();
  // Match an @media (prefers-color-scheme: dark) block that targets
  // body:not(.dark-mode-forced)[:not(.light-mode-forced)] .header-gradient.
  const re = new RegExp(
    String.raw`@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{[\s\S]*?${NOT_DARK}\s+\.header-gradient\s*\{`,
  );
  assert.match(
    src,
    re,
    "expected an @media (prefers-color-scheme: dark) override targeting body:not(.dark-mode-forced) .header-gradient",
  );
});

test("header-gradient: auto+system-dark also overrides h1 and p text colour", () => {
  const src = readStyles();
  const re = new RegExp(
    String.raw`@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{[\s\S]*?${NOT_DARK}\s+\.header-gradient\s+h1\s*,\s*${NOT_DARK}\s+\.header-gradient\s+p\s*\{`,
  );
  assert.match(
    src,
    re,
    "expected auto+system-dark override for `.header-gradient h1, .header-gradient p`",
  );
});

test("header-gradient: default rule keeps the purple identity for auto-light", () => {
  const src = readStyles();
  // The default `.header-gradient {` block must still reference the
  // primary/secondary colour vars so auto-light keeps its purple look.
  const body = extractBlock(src, /^\.header-gradient\s*\{/m);
  assert.ok(body, "expected a default `.header-gradient` block");
  assert.match(
    body,
    /--primary-color/,
    "default header-gradient must keep its primary-colour gradient stop",
  );
  assert.match(
    body,
    /--secondary-color/,
    "default header-gradient must keep its secondary-colour gradient stop",
  );
});

test("index.html bumps the styles.css cache-busting query", () => {
  const html = fs.readFileSync(INDEX_HTML, "utf8");
  const m = html.match(/styles\.css\?v=([\d.]+)/);
  assert.ok(m, "expected styles.css?v=… cache-busting query in index.html");
  // Issue #44 must ship a version strictly newer than 1.0.103.
  const parts = m[1].split(".").map((n) => parseInt(n, 10));
  const cmp = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] ?? 0;
      const y = b[i] ?? 0;
      if (x !== y) return x - y;
    }
    return 0;
  };
  assert.ok(
    cmp(parts, [1, 0, 103]) > 0,
    `styles.css cache version must be > 1.0.103, got ${m[1]}`,
  );
});
