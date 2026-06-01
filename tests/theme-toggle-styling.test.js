// Theme toggle button styling tests (issues #45, #70).
//
// Issue #44 moved the header banner onto theme-aware CSS overrides.
// Issue #45 did the same for the toggle button itself: the inline
// `style=` attribute on `#dark-mode-toggle` and the per-case
// `.style.backgroundColor` / `.style.color` writes inside
// `updateDarkMode()` were replaced with CSS classes and theme-aware
// CSS rules.
//
// Issue #70 rewrites the guards below. They used to grep *source text*
// (which property `updateDarkMode()` assigns; the exact selector
// spelling and the `min-width: 40px` literal in `styles.css`). Those
// HOW-tests dictated the mechanism rather than the outcome: a
// behaviour-preserving refactor (set the colour a different way, express
// the same touch target with `width`/`rem`, restructure the cascade)
// broke them with no rendered regression, while a wrong-colour change
// using the "approved" mechanism passed. They asserted the wrong thing
// in both directions.
//
// They are now WHAT-tests. Using the shared CSS cascade resolver
// (`tests/_css_cascade.js`, first written for issue #67) we compute the
// declaration that actually WINS for the toggle in each theme state and
// assert the rendered colour / touch-target the user sees. The toggle's
// colour is driven by the *body* theme class plus the OS colour-scheme;
// `updateDarkMode()` sets that body class (and a cosmetic
// `theme-toggle-*` marker), so these computed-outcome assertions describe
// exactly "the toggle ends up the right colour for the active theme" —
// independent of how the implementation gets there.
//
// Australian English: behaviour, colour, organisation.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { bodyWith, parseRules, resolve } from "./_css_cascade.js";

const REPO_ROOT = path.resolve(process.cwd());
const INDEX_HTML = path.join(REPO_ROOT, "docs", "index.html");
const STYLES_CSS = path.join(REPO_ROOT, "docs", "styles.css");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

// Extract the `<button id="dark-mode-toggle" ...>` opening tag.
function extractToggleTag(html) {
  const m = html.match(/<button[^>]*\bid="dark-mode-toggle"[^>]*>/);
  return m ? m[0] : null;
}

const RULES = parseRules(read(STYLES_CSS));

// The toggle element model. `theme-toggle-*` is the cosmetic state marker
// `updateDarkMode()` adds; the colour cascade keys off the body class, so
// the marker is supplied for realism but does not change resolution.
const toggle = (...cls) => ({
  tag: "button",
  id: "dark-mode-toggle",
  classes: new Set(["btn", "btn-outline-light", ...cls]),
});

// Resolve a property's winning value on the toggle for a theme scenario.
function toggleStyle(bodyClasses, prefersDark, prop, toggleClasses = []) {
  return resolve(
    RULES,
    toggle(...toggleClasses),
    bodyWith(...bodyClasses),
    prefersDark,
    prop,
  );
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

// --- Rendered colour per theme state (replaces the JS/CSS source greps) ---

test("toggle renders the LIGHT-forced colours (computed cascade)", () => {
  // OS scheme should not matter once the user forces light (issue #67).
  for (const prefersDark of [false, true]) {
    const bg = toggleStyle(
      ["light-mode-forced"],
      prefersDark,
      "background-color",
      ["theme-toggle-light"],
    );
    const fg = toggleStyle(["light-mode-forced"], prefersDark, "color", [
      "theme-toggle-light",
    ]);
    assert.match(
      bg,
      /255,\s*255,\s*255/,
      `light-forced toggle should render a light background (OS dark=${prefersDark}), got: ${bg}`,
    );
    assert.equal(
      fg.toLowerCase(),
      "#212529",
      `light-forced toggle text should be dark-on-light (OS dark=${prefersDark}), got: ${fg}`,
    );
  }
});

test("toggle renders the DARK-forced colours (computed cascade)", () => {
  for (const prefersDark of [false, true]) {
    const bg = toggleStyle(
      ["dark-mode-forced"],
      prefersDark,
      "background-color",
      ["theme-toggle-dark"],
    );
    const fg = toggleStyle(["dark-mode-forced"], prefersDark, "color", [
      "theme-toggle-dark",
    ]);
    assert.match(
      bg,
      /0,\s*0,\s*0/,
      `dark-forced toggle should render a dark background (OS dark=${prefersDark}), got: ${bg}`,
    );
    assert.equal(
      fg.toLowerCase(),
      "#f0f6fc",
      `dark-forced toggle text should be light-on-dark (OS dark=${prefersDark}), got: ${fg}`,
    );
  }
});

test("toggle renders the AUTO + system-DARK colours (computed cascade)", () => {
  const bg = toggleStyle([], true, "background-color", ["theme-toggle-auto"]);
  const fg = toggleStyle([], true, "color", ["theme-toggle-auto"]);
  assert.match(
    bg,
    /0,\s*0,\s*0/,
    `auto + system-dark toggle should render a dark background, got: ${bg}`,
  );
  assert.equal(
    fg.toLowerCase(),
    "#f0f6fc",
    `auto + system-dark toggle text should be light-on-dark, got: ${fg}`,
  );
});

test("toggle renders the AUTO + system-LIGHT default colours (computed cascade)", () => {
  const bg = toggleStyle([], false, "background-color", ["theme-toggle-auto"]);
  const fg = toggleStyle([], false, "color", ["theme-toggle-auto"]);
  assert.match(
    bg,
    /255,\s*255,\s*255/,
    `auto + system-light toggle should keep the translucent white background, got: ${bg}`,
  );
  assert.equal(
    (fg || "").toLowerCase(),
    "white",
    `auto + system-light toggle text should be white, got: ${fg}`,
  );
});

test("toggle light-forced and dark-forced render different backgrounds", () => {
  // The states must not collapse onto the same rendered colour — guards
  // against a cascade change that accidentally ties the two themes.
  const light = toggleStyle(["light-mode-forced"], false, "background-color");
  const dark = toggleStyle(["dark-mode-forced"], false, "background-color");
  assert.notEqual(
    light,
    dark,
    `light- and dark-forced toggles must render different backgrounds (light=${light}, dark=${dark})`,
  );
});

// --- Touch target geometry (replaces the min-width/height source grep) ---

// Convert a CSS length to pixels (16px root). Returns NaN for non-length
// values so the caller can ignore `auto`, percentages, etc.
function toPx(value) {
  if (!value) return NaN;
  const m = value.trim().match(/^(-?\d*\.?\d+)\s*(px|rem|em)?$/i);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  const unit = (m[2] || "px").toLowerCase();
  return unit === "px" ? n : n * 16; // rem/em against the 16px default root
}

// The guaranteed minimum rendered size along an axis: the largest of any
// fixed lower bound the cascade sets (`min-<axis>` or an explicit
// `<axis>`), unit-normalised. This is behaviour, not spelling — a refactor
// to `width: 2.5rem` or `height: 40px` yields the same touch target and
// still passes, while shrinking the box below 40px fails.
function effectiveMinPx(bodyClasses, prefersDark, axis) {
  const bounds = [
    toPx(toggleStyle(bodyClasses, prefersDark, `min-${axis}`)),
    toPx(toggleStyle(bodyClasses, prefersDark, axis)),
  ].filter((n) => !Number.isNaN(n));
  return bounds.length ? Math.max(...bounds) : NaN;
}

test("toggle keeps a >= 40px touch target in every theme state", () => {
  const scenarios = [
    { label: "auto + system-light", body: [], dark: false },
    { label: "auto + system-dark", body: [], dark: true },
    { label: "light-forced", body: ["light-mode-forced"], dark: false },
    { label: "dark-forced", body: ["dark-mode-forced"], dark: true },
  ];
  for (const s of scenarios) {
    const w = effectiveMinPx(s.body, s.dark, "width");
    const h = effectiveMinPx(s.body, s.dark, "height");
    assert.ok(
      w >= 40,
      `${s.label}: toggle width must guarantee a >= 40px touch target, got ${w}px`,
    );
    assert.ok(
      h >= 40,
      `${s.label}: toggle height must guarantee a >= 40px touch target, got ${h}px`,
    );
  }
});

test("toggle stays centred via flex so the icon sits in the touch target", () => {
  // The centring is what makes the 40x40 box a usable target; assert the
  // resolved display rather than the source spelling.
  const display = toggleStyle([], false, "display");
  assert.match(
    display || "",
    /flex/,
    `toggle should resolve to a flex box for icon centring, got: ${display}`,
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
