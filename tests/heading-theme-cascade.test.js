// Heading-section theme cascade tests (issue #67).
//
// The top heading section (`.header-gradient` banner and its
// `#dark-mode-toggle` button) must follow the *selected* theme, not the
// operating-system theme. A regression made the auto+system-dark overrides
// use `body:not(.dark-mode-forced)`, which still matches when the user has
// forced LIGHT mode (a light-forced body is, after all, "not dark-forced").
// Those overrides tie on specificity and !important with the
// `body.light-mode-forced` rules but appear later in source order, so the
// dark colours won whenever the OS was in dark mode — leaving the heading
// dark while the rest of the page went light (see the issue screenshot).
//
// Rather than grepping the stylesheet for a pattern, these tests parse
// docs/styles.css and run a small but real CSS cascade resolver: for a
// given set of body classes and OS colour-scheme they compute which
// declaration actually WINS for a property on the heading elements. The
// assertions therefore describe rendered behaviour and survive any fix
// strategy (extra :not(), reordering, dropping !important, …).
//
// Australian English: behaviour, colour.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { bodyWith, parseRules, resolve } from "./_css_cascade.js";

// Issue #70 factored the cascade resolver out into tests/_css_cascade.js
// so the heading and toggle theme tests share one implementation. The
// behaviour is unchanged; see that module for the resolver internals.

const STYLES_CSS = path.join(process.cwd(), "docs", "styles.css");

const RULES = parseRules(fs.readFileSync(STYLES_CSS, "utf8"));

const header = {
  tag: "div",
  id: null,
  classes: new Set(["card-header", "header-gradient", "text-white"]),
};
const toggle = {
  tag: "button",
  id: "dark-mode-toggle",
  classes: new Set(["btn", "btn-outline-light", "theme-toggle-auto"]),
};
// `bodyWith` is imported from tests/_css_cascade.js (issue #70).

// --- The regression: light forced while the OS is dark -------------------

test("header background follows LIGHT selection even when the OS is dark", () => {
  const bg = resolve(RULES, header, bodyWith("light-mode-forced"), true, "background");
  assert.ok(bg, "expected a winning background for the header");
  assert.match(bg, /#f8f9fa/i, `header should use the light gradient, got: ${bg}`);
  assert.doesNotMatch(bg, /#0d1117/i, `header must not stay dark in light mode, got: ${bg}`);
});

test("header text colour follows LIGHT selection even when the OS is dark", () => {
  const col = resolve(RULES, header, bodyWith("light-mode-forced"), true, "color");
  assert.equal(col.toLowerCase(), "#212529", `header text should be dark-on-light, got: ${col}`);
});

test("toggle button follows LIGHT selection even when the OS is dark", () => {
  const bg = resolve(
    RULES,
    toggle,
    bodyWith("light-mode-forced", "theme-toggle-light"),
    true,
    "background-color",
  );
  assert.ok(bg, "expected a winning background-color for the toggle");
  assert.match(bg, /255,\s*255,\s*255/, `toggle should use the light background, got: ${bg}`);
});

// --- Directions that must keep working -----------------------------------

test("header background follows DARK selection when the OS is light", () => {
  const bg = resolve(RULES, header, bodyWith("dark-mode-forced"), false, "background");
  assert.match(bg, /#0d1117/i, `dark selection should give a dark header, got: ${bg}`);
});

test("header is dark in AUTO mode when the OS is dark", () => {
  const bg = resolve(RULES, header, bodyWith(), true, "background");
  assert.match(bg, /#0d1117/i, `auto + system-dark should be dark, got: ${bg}`);
});

test("header keeps the brand purple in AUTO mode when the OS is light", () => {
  const bg = resolve(RULES, header, bodyWith(), false, "background");
  assert.match(bg, /--primary-color/, `auto + system-light should keep the purple identity, got: ${bg}`);
});

test("header is light in LIGHT mode when the OS is also light", () => {
  const bg = resolve(RULES, header, bodyWith("light-mode-forced"), false, "background");
  assert.match(bg, /#f8f9fa/i, `light selection should give a light header, got: ${bg}`);
});
