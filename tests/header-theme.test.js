// Header banner theme-aware tests (issues #44, #72).
//
// The top `.card-header.header-gradient` previously hard-coded a purple
// gradient and `color: white !important`, so it stayed purple regardless
// of the active theme. Issue #44 asks for the header to respond to the
// three theme states the toggle drives:
//
//   * light forced       → body.light-mode-forced
//   * dark forced         → body.dark-mode-forced
//   * auto + system dark  → @media (prefers-color-scheme: dark)
//                           body:not(.dark-mode-forced):not(.light-mode-forced)
//
// Issue #72 rewrites these guards. They used to read docs/styles.css as a
// raw string, slice out a selector's declaration block with a regex, and
// assert only that the block existed and contained the word `background`
// or a `color:` declaration. Those were HOW-tests: a behaviour-preserving
// refactor (consolidating selectors, switching to a shared theme class,
// moving to CSS custom properties) changed the source text and broke every
// assertion while the header rendered identically — and a rule that merely
// contained the word `background` but resolved to the wrong colour still
// passed. They asserted how the stylesheet was spelled, not what colour the
// user sees.
//
// They are now WHAT-tests. Using the shared CSS cascade resolver
// (`tests/_css_cascade.js`, first written for issue #67) we compute the
// declaration that actually WINS for the header banner — and its h1/p
// text — in each theme state, and assert the rendered colour the user
// sees. The assertions therefore survive any fix strategy (extra :not(),
// reordering, dropping !important, custom properties) and fail if the
// header ever resolves to the wrong colour.
//
// Australian English: behaviour, colour, organisation.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { bodyWith, parseRules, resolve } from "./_css_cascade.js";

const REPO_ROOT = path.resolve(process.cwd());
const STYLES_CSS = path.join(REPO_ROOT, "docs", "styles.css");
const INDEX_HTML = path.join(REPO_ROOT, "docs", "index.html");

const RULES = parseRules(fs.readFileSync(STYLES_CSS, "utf8"));

// The header banner element as it appears in docs/index.html.
const header = {
  tag: "div",
  id: null,
  classes: new Set(["card-header", "header-gradient", "text-white"]),
};

// The resolver matches every non-rightmost compound of a descendant
// selector against a single ancestor model. The h1/p rules are written
// `body.<theme> .header-gradient h1` (three compounds), so the ancestor
// must satisfy both `body.<theme>` and `.header-gradient`. We therefore
// fold the header-gradient class onto the body ancestor for h1/p lookups;
// this still computes the genuine cascade winner for the text colour.
function headerAncestor(...cls) {
  return bodyWith(...cls, "header-gradient");
}
const h1 = { tag: "h1", id: null, classes: new Set() };
const p = { tag: "p", id: null, classes: new Set() };

// Expected per-theme colours, taken from the rendered design (issue #44).
const LIGHT_BG = /#f8f9fa/i; // soft neutral background
const LIGHT_TEXT = "#212529"; // dark-on-light text
const DARK_BG = /#0d1117/i; // deep background
const DARK_TEXT = "#f0f6fc"; // light-on-dark text

// --- Header banner background --------------------------------------------

test("header background resolves to the light gradient when LIGHT is forced", () => {
  // OS is dark to prove the *selection* wins over the system preference.
  const bg = resolve(RULES, header, bodyWith("light-mode-forced"), true, "background");
  assert.ok(bg, "expected a winning background for the header");
  assert.match(bg, LIGHT_BG, `light selection should give a light header, got: ${bg}`);
  assert.doesNotMatch(bg, DARK_BG, `header must not stay dark in light mode, got: ${bg}`);
});

test("header background resolves to the dark gradient when DARK is forced", () => {
  // OS is light to prove the selection wins over the system preference.
  const bg = resolve(RULES, header, bodyWith("dark-mode-forced"), false, "background");
  assert.ok(bg, "expected a winning background for the header");
  assert.match(bg, DARK_BG, `dark selection should give a dark header, got: ${bg}`);
});

test("header background resolves to dark in AUTO mode when the OS is dark", () => {
  const bg = resolve(RULES, header, bodyWith(), true, "background");
  assert.match(bg, DARK_BG, `auto + system-dark should be dark, got: ${bg}`);
});

test("header resolves to the light gradient in AUTO mode when the OS is light", () => {
  // Issue #96 (business-logic change): auto must FOLLOW the OS, not keep a
  // unique brand-purple look that matches neither the light nor the dark
  // theme. When the system is light and no theme is forced the header now
  // mirrors the light-forced gradient. This supersedes the issue-#44
  // "auto + system-light keeps the purple identity" assertion.
  const bg = resolve(RULES, header, bodyWith(), false, "background");
  assert.ok(bg, "expected a winning background for the header");
  assert.match(bg, LIGHT_BG, `auto + system-light should be light, got: ${bg}`);
  assert.doesNotMatch(
    bg,
    /var\(--primary-color\)|var\(--secondary-color\)/,
    `auto + system-light must no longer keep the purple identity, got: ${bg}`,
  );
});

// --- Header banner text colour -------------------------------------------

test("header text colour resolves dark-on-light when LIGHT is forced", () => {
  const col = resolve(RULES, header, bodyWith("light-mode-forced"), true, "color");
  assert.equal(col.toLowerCase(), LIGHT_TEXT, `header text should be dark-on-light, got: ${col}`);
});

test("header text colour resolves light-on-dark when DARK is forced", () => {
  const col = resolve(RULES, header, bodyWith("dark-mode-forced"), false, "color");
  assert.equal(col.toLowerCase(), DARK_TEXT, `header text should be light-on-dark, got: ${col}`);
});

test("header text colour resolves light-on-dark in AUTO mode when the OS is dark", () => {
  const col = resolve(RULES, header, bodyWith(), true, "color");
  assert.equal(col.toLowerCase(), DARK_TEXT, `auto + system-dark text should be light, got: ${col}`);
});

// --- h1 / p text colour follow the same three states --------------------

test("header h1 and p text follow LIGHT selection (dark-on-light)", () => {
  for (const el of [h1, p]) {
    const col = resolve(RULES, el, headerAncestor("light-mode-forced"), true, "color");
    assert.equal(
      col.toLowerCase(),
      LIGHT_TEXT,
      `${el.tag} should be dark-on-light in light mode, got: ${col}`,
    );
  }
});

test("header h1 and p text follow DARK selection (light-on-dark)", () => {
  for (const el of [h1, p]) {
    const col = resolve(RULES, el, headerAncestor("dark-mode-forced"), false, "color");
    assert.equal(
      col.toLowerCase(),
      DARK_TEXT,
      `${el.tag} should be light-on-dark in dark mode, got: ${col}`,
    );
  }
});

test("header h1 and p text are light-on-dark in AUTO mode when the OS is dark", () => {
  for (const el of [h1, p]) {
    const col = resolve(RULES, el, headerAncestor(), true, "color");
    assert.equal(
      col.toLowerCase(),
      DARK_TEXT,
      `${el.tag} should be light-on-dark for auto + system-dark, got: ${col}`,
    );
  }
});

// --- Cache-busting query (unchanged from issue #44) ----------------------

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
