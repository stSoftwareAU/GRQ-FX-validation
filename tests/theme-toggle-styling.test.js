// Theme toggle button styling tests (issue #45).
//
// Issue #44 moved the header banner onto theme-aware CSS overrides.
// Issue #45 does the same for the toggle button itself: the inline
// `style=` attribute on `#dark-mode-toggle` and the per-case
// `.style.backgroundColor` / `.style.color` writes inside
// `updateDarkMode()` are replaced with CSS classes
// (`theme-toggle-light`, `theme-toggle-dark`, `theme-toggle-auto`)
// and theme-aware CSS rules.
//
// These tests guard the three observable outcomes:
//
//   1. No inline `style=` attribute on `#dark-mode-toggle` in
//      `docs/index.html`.
//   2. `updateDarkMode()` in `docs/index.js` does not write
//      `.style.backgroundColor` or `.style.color` on the toggle
//      button.
//   3. `docs/styles.css` ships `#dark-mode-toggle` rules under each
//      of the three theme-state selectors (light-forced, dark-forced,
//      auto + system dark).
//
// Australian English: behaviour, colour, organisation.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const INDEX_HTML = path.join(REPO_ROOT, "docs", "index.html");
const INDEX_JS = path.join(REPO_ROOT, "docs", "index.js");
const STYLES_CSS = path.join(REPO_ROOT, "docs", "styles.css");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

// Extract the `<button id="dark-mode-toggle" ...>` opening tag.
function extractToggleTag(html) {
  const m = html.match(/<button[^>]*\bid="dark-mode-toggle"[^>]*>/);
  return m ? m[0] : null;
}

// Extract the body of the first function `name` declared in `src`.
// Walks braces so nested blocks (e.g. switch / case) are captured.
function extractFunctionBody(src, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = src.match(re);
  if (!m) return null;
  let i = src.indexOf("{", m.index + m[0].length - 1);
  if (i === -1) return null;
  const start = i;
  let depth = 0;
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

test("index.html: #dark-mode-toggle has no inline style attribute", () => {
  const html = read(INDEX_HTML);
  const tag = extractToggleTag(html);
  assert.ok(tag, "expected to find the #dark-mode-toggle <button> tag");
  assert.doesNotMatch(
    tag,
    /\bstyle\s*=/,
    "the toggle button must not carry an inline style= attribute — colours belong in CSS",
  );
});

test("index.js: updateDarkMode() does not write toggleButton.style.backgroundColor or .style.color", () => {
  const js = read(INDEX_JS);
  const body = extractFunctionBody(js, "updateDarkMode");
  assert.ok(body, "expected to find updateDarkMode() in docs/index.js");
  assert.doesNotMatch(
    body,
    /toggleButton\.style\.backgroundColor/,
    "updateDarkMode() must not assign toggleButton.style.backgroundColor — use classList instead",
  );
  assert.doesNotMatch(
    body,
    /toggleButton\.style\.color\b/,
    "updateDarkMode() must not assign toggleButton.style.color — use classList instead",
  );
});

test("index.js: updateDarkMode() drives the toggle via classList", () => {
  const js = read(INDEX_JS);
  const body = extractFunctionBody(js, "updateDarkMode");
  assert.ok(body, "expected to find updateDarkMode() in docs/index.js");
  assert.match(
    body,
    /toggleButton\.classList/,
    "updateDarkMode() must mutate toggleButton.classList for theme-driven colours",
  );
});

test("styles.css: #dark-mode-toggle has a light-mode-forced override", () => {
  const css = read(STYLES_CSS);
  assert.match(
    css,
    /body\.light-mode-forced\s+#dark-mode-toggle\s*\{/,
    "expected a `body.light-mode-forced #dark-mode-toggle` rule",
  );
});

test("styles.css: #dark-mode-toggle has a dark-mode-forced override", () => {
  const css = read(STYLES_CSS);
  assert.match(
    css,
    /body\.dark-mode-forced\s+#dark-mode-toggle\s*\{/,
    "expected a `body.dark-mode-forced #dark-mode-toggle` rule",
  );
});

test("styles.css: #dark-mode-toggle has an auto + system-dark override via @media", () => {
  const css = read(STYLES_CSS);
  // Issue #67 added a `:not(.light-mode-forced)` guard so this rule does not
  // override the light-forced toggle styling when the OS is dark; allow that
  // optional extra `:not(…)` qualifier here.
  const re =
    /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{[\s\S]*?body:not\(\.dark-mode-forced\)(?::not\([^)]*\))?\s+#dark-mode-toggle\s*\{/;
  assert.match(
    css,
    re,
    "expected an @media (prefers-color-scheme: dark) override targeting body:not(.dark-mode-forced) #dark-mode-toggle",
  );
});

test("styles.css: default #dark-mode-toggle rule keeps the 40x40 touch target", () => {
  const css = read(STYLES_CSS);
  // Find the default (un-prefixed) rule and confirm min-width/min-height
  // remain at least 40px so the touch target sizing is preserved.
  const re = /(^|\n)#dark-mode-toggle\s*\{([\s\S]*?)\}/;
  const m = css.match(re);
  assert.ok(m, "expected a default `#dark-mode-toggle {` rule");
  const body = m[2];
  const w = body.match(/min-width\s*:\s*(\d+)px/);
  const h = body.match(/min-height\s*:\s*(\d+)px/);
  assert.ok(w, "default #dark-mode-toggle rule should set min-width");
  assert.ok(h, "default #dark-mode-toggle rule should set min-height");
  assert.ok(
    parseInt(w[1], 10) >= 40,
    `min-width must be >= 40px (touch target), got ${w[1]}`,
  );
  assert.ok(
    parseInt(h[1], 10) >= 40,
    `min-height must be >= 40px (touch target), got ${h[1]}`,
  );
});

test("index.html bumps the styles.css cache-busting query past 1.0.104", () => {
  const html = read(INDEX_HTML);
  const m = html.match(/styles\.css\?v=([\d.]+)/);
  assert.ok(m, "expected styles.css?v=… cache-busting query in index.html");
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
    cmp(parts, [1, 0, 104]) > 0,
    `styles.css cache version must be > 1.0.104, got ${m[1]}`,
  );
});
