// Auto theme must mirror the forced theme for the active OS (issue #96).
//
// The toggle exposes three states — light, dark and auto. "Auto" is meant
// to follow the operating system: it should render exactly like the
// LIGHT-forced theme when the OS is light, and exactly like the
// DARK-forced theme when the OS is dark.
//
// Before this fix the auto path diverged from both: issue #44/#67 kept a
// brand-purple header gradient (and a translucent-white toggle) for
// "auto + system-light", so the dashboard rendered a third look that was
// neither the light theme nor the dark theme — the exact complaint in
// issue #96 ("Auto theme doesn't look like light or dark themes"). The
// header and toggle now gain @media (prefers-color-scheme: light)
// overrides that mirror the LIGHT-forced colours, symmetric with the
// existing @media (prefers-color-scheme: dark) overrides for auto + dark.
//
// These are WHAT-tests built on the shared CSS cascade resolver
// (tests/_css_cascade.js): they compute the declaration that actually
// WINS for the header banner and toggle in each scenario and assert that
// the AUTO rendering equals the matching FORCED rendering — so they
// survive any future re-spelling of the cascade and fail only on a real
// visual divergence.
//
// Australian English: behaviour, colour.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { bodyWith, parseRules, resolve } from "./_css_cascade.js";

const REPO_ROOT = path.resolve(process.cwd());
const STYLES_CSS = path.join(REPO_ROOT, "docs", "styles.css");
const RULES = parseRules(fs.readFileSync(STYLES_CSS, "utf8"));

// The header banner element as it appears in docs/index.html.
const header = {
  tag: "div",
  id: null,
  classes: new Set(["card-header", "header-gradient", "text-white"]),
};
// h1/p inside the header — fold the header-gradient class onto the body
// ancestor so the resolver matches the `body.<theme> .header-gradient h1`
// descendant rules (same technique as header-theme.test.js).
function headerAncestor(...cls) {
  return bodyWith(...cls, "header-gradient");
}
const h1 = { tag: "h1", id: null, classes: new Set() };
const p = { tag: "p", id: null, classes: new Set() };

// The toggle button as it appears in docs/index.html.
const toggle = (...cls) => ({
  tag: "button",
  id: "dark-mode-toggle",
  classes: new Set(["btn", "btn-outline-light", ...cls]),
});

// Collapse insignificant whitespace so two declarations that differ only
// in source indentation (e.g. a multi-line gradient) compare equal — we
// assert on the rendered colour, not on the stylesheet's formatting.
function norm(value) {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

// --- Header banner: auto mirrors forced ---------------------------------

test("auto header background equals the LIGHT-forced header when the OS is light", () => {
  const auto = resolve(RULES, header, bodyWith(), false, "background");
  const forced = resolve(RULES, header, bodyWith("light-mode-forced"), false, "background");
  assert.ok(auto, "expected a winning header background for auto + system-light");
  assert.equal(
    norm(auto),
    norm(forced),
    `auto + system-light header must match the light-forced header (auto=${auto}, forced=${forced})`,
  );
  assert.doesNotMatch(
    auto,
    /var\(--primary-color\)|var\(--secondary-color\)/,
    `auto + system-light header must not keep the brand-purple gradient, got: ${auto}`,
  );
});

test("auto header background equals the DARK-forced header when the OS is dark", () => {
  const auto = resolve(RULES, header, bodyWith(), true, "background");
  const forced = resolve(RULES, header, bodyWith("dark-mode-forced"), true, "background");
  assert.ok(auto, "expected a winning header background for auto + system-dark");
  assert.equal(
    norm(auto),
    norm(forced),
    `auto + system-dark header must match the dark-forced header (auto=${auto}, forced=${forced})`,
  );
});

test("auto header text equals the LIGHT-forced header text when the OS is light", () => {
  for (const el of [header, h1, p]) {
    const ancestor = el === header ? bodyWith() : headerAncestor();
    const forcedAncestor = el === header
      ? bodyWith("light-mode-forced")
      : headerAncestor("light-mode-forced");
    const auto = resolve(RULES, el, ancestor, false, "color");
    const forced = resolve(RULES, el, forcedAncestor, false, "color");
    assert.equal(
      norm(auto),
      norm(forced),
      `${el.tag} text in auto + system-light must match light-forced (auto=${auto}, forced=${forced})`,
    );
  }
});

test("auto header text equals the DARK-forced header text when the OS is dark", () => {
  for (const el of [header, h1, p]) {
    const ancestor = el === header ? bodyWith() : headerAncestor();
    const forcedAncestor = el === header
      ? bodyWith("dark-mode-forced")
      : headerAncestor("dark-mode-forced");
    const auto = resolve(RULES, el, ancestor, true, "color");
    const forced = resolve(RULES, el, forcedAncestor, true, "color");
    assert.equal(
      norm(auto),
      norm(forced),
      `${el.tag} text in auto + system-dark must match dark-forced (auto=${auto}, forced=${forced})`,
    );
  }
});

// --- Toggle button: auto mirrors forced ---------------------------------

test("auto toggle colours equal the LIGHT-forced toggle when the OS is light", () => {
  for (const prop of ["background-color", "color", "border"]) {
    const auto = resolve(RULES, toggle("theme-toggle-auto"), bodyWith(), false, prop);
    const forced = resolve(
      RULES,
      toggle("theme-toggle-light"),
      bodyWith("light-mode-forced"),
      false,
      prop,
    );
    assert.equal(
      norm(auto),
      norm(forced),
      `toggle ${prop} in auto + system-light must match light-forced (auto=${auto}, forced=${forced})`,
    );
  }
});

test("auto toggle colours equal the DARK-forced toggle when the OS is dark", () => {
  for (const prop of ["background-color", "color", "border"]) {
    const auto = resolve(RULES, toggle("theme-toggle-auto"), bodyWith(), true, prop);
    const forced = resolve(
      RULES,
      toggle("theme-toggle-dark"),
      bodyWith("dark-mode-forced"),
      true,
      prop,
    );
    assert.equal(
      norm(auto),
      norm(forced),
      `toggle ${prop} in auto + system-dark must match dark-forced (auto=${auto}, forced=${forced})`,
    );
  }
});

// --- The light and dark auto renderings stay distinct -------------------

test("auto header differs between a light OS and a dark OS", () => {
  const light = resolve(RULES, header, bodyWith(), false, "background");
  const dark = resolve(RULES, header, bodyWith(), true, "background");
  assert.notEqual(
    light,
    dark,
    `auto must render differently for a light vs dark OS (light=${light}, dark=${dark})`,
  );
});
