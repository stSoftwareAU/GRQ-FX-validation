// Dark/light/auto toggle emoji tests (issue #34).
//
// The dashboard theme toggle button previously rendered the letters
// "L", "D" and "A" to indicate the active mode. Issue #34 asked for
// emojis instead so the state is visually obvious without reading.
//
// These tests assert that docs/index.js sets the standard emoji glyphs
// for each of the three states and uses them as both the default icon
// content and the value applied inside the updateDarkMode() switch.
//
// Australian English: behaviour, colour, organisation.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const INDEX_JS = path.join(REPO_ROOT, "docs", "index.js");

// Canonical emojis chosen for the three states.
//   Auto  → 🌓 first-quarter moon (suggests "follows system")
//   Light → ☀️  sun
//   Dark  → 🌙 crescent moon
const AUTO_EMOJI = "\u{1F313}"; // 🌓
const LIGHT_EMOJI = "☀️"; // ☀️
const DARK_EMOJI = "\u{1F319}"; // 🌙

function readIndexJs() {
  return fs.readFileSync(INDEX_JS, "utf8");
}

// Extract the body of the updateDarkMode() function so per-state regexes
// cannot accidentally match the click handler's `switch (userPreference)`
// (which also lists "light"/"dark"/"auto" cases but does not set
// textContent). Returns the source text from the function header to the
// closing brace.
function extractUpdateDarkModeBody(src) {
  const start = src.indexOf("function updateDarkMode(");
  assert.notEqual(start, -1, "updateDarkMode() function not found");
  // Walk braces from the first `{` after the header to its matching `}`.
  let i = src.indexOf("{", start);
  assert.notEqual(i, -1, "updateDarkMode() opening brace not found");
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("updateDarkMode() closing brace not found");
}

test("dark mode toggle: default icon textContent uses the auto emoji", () => {
  const src = readIndexJs();
  // Default icon is set once when the button is created dynamically.
  // Match: toggleIcon.textContent = "<emoji>"; with an optional trailing
  // comment.
  const re =
    /toggleIcon\.textContent\s*=\s*(["'`])([^"'`]+)\1\s*;\s*(?:\/\/[^\n]*)?/;
  const m = src.match(re);
  assert.ok(m, "expected an initial toggleIcon.textContent assignment");
  assert.equal(
    m[2],
    AUTO_EMOJI,
    `default icon should be the auto emoji (${AUTO_EMOJI}), got ${JSON.stringify(m[2])}`,
  );
});

test("dark mode toggle: light branch sets sun emoji", () => {
  const body = extractUpdateDarkModeBody(readIndexJs());
  const re =
    /case\s+["']light["']\s*:[\s\S]*?toggleIcon\.textContent\s*=\s*(["'`])([^"'`]+)\1/;
  const m = body.match(re);
  assert.ok(m, "expected a 'light' case that sets toggleIcon.textContent");
  assert.equal(
    m[2],
    LIGHT_EMOJI,
    `light state should use ${LIGHT_EMOJI}, got ${JSON.stringify(m[2])}`,
  );
});

test("dark mode toggle: dark branch sets moon emoji", () => {
  const body = extractUpdateDarkModeBody(readIndexJs());
  const re =
    /case\s+["']dark["']\s*:[\s\S]*?toggleIcon\.textContent\s*=\s*(["'`])([^"'`]+)\1/;
  const m = body.match(re);
  assert.ok(m, "expected a 'dark' case that sets toggleIcon.textContent");
  assert.equal(
    m[2],
    DARK_EMOJI,
    `dark state should use ${DARK_EMOJI}, got ${JSON.stringify(m[2])}`,
  );
});

test("dark mode toggle: auto branch sets first-quarter moon emoji", () => {
  const body = extractUpdateDarkModeBody(readIndexJs());
  const re =
    /case\s+["']auto["']\s*:[\s\S]*?toggleIcon\.textContent\s*=\s*(["'`])([^"'`]+)\1/;
  const m = body.match(re);
  assert.ok(m, "expected an 'auto' case that sets toggleIcon.textContent");
  assert.equal(
    m[2],
    AUTO_EMOJI,
    `auto state should use ${AUTO_EMOJI}, got ${JSON.stringify(m[2])}`,
  );
});

test("dark mode toggle: legacy single-letter labels are gone", () => {
  const src = readIndexJs();
  // Each of these assignments was the exact form previously used.
  // Their continued presence would mean the emoji change regressed.
  for (const legacy of ['"L"', '"D"', '"A"']) {
    assert.equal(
      src.includes(`toggleIcon.textContent = ${legacy}`),
      false,
      `legacy assignment toggleIcon.textContent = ${legacy} should have been replaced with an emoji`,
    );
  }
});
