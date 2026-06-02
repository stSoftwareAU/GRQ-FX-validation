// Dark/light/auto toggle emoji tests (issues #34, #69).
//
// The dashboard theme toggle button previously rendered the letters
// "L", "D" and "A" to indicate the active mode. Issue #34 asked for
// emojis instead so the state is visually obvious without reading.
//
// Issue #69 rewrites these tests. They used to read docs/index.js as a
// string and regex-match the *source text* of updateDarkMode() — the
// switch/case shape, the `toggleIcon.textContent = …` spelling and the
// quote style. Those HOW-tests broke on any behaviour-preserving
// refactor (switch → lookup map, computed glyph, extracted constant)
// while a wrong-glyph change using the "approved" mechanism still passed.
//
// They are now WHAT-tests. Following the repo's existing pattern
// (tests/fx-card-xss.test.ts) we load the real updateDarkMode() out of
// docs/index.js and EXECUTE it against a minimal DOM mock, then assert
// the toggle icon's rendered `textContent` for each state — the glyph a
// user actually sees. This survives any reimplementation of the branch
// and fails only on a real rendered regression.
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

// Extract the full `function updateDarkMode(preference) { … }` declaration
// from the source so it can be executed in isolation. Brace-walks from the
// header's first `{` to its matching `}`. This is harness code that LOCATES
// the production function to run — the assertions below are on the rendered
// outcome, not on this text.
function extractUpdateDarkMode(src) {
  const start = src.indexOf("function updateDarkMode(");
  assert.notEqual(start, -1, "updateDarkMode() function not found");
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

// A minimal DOM mock covering only the surface updateDarkMode() touches:
// the icon's textContent, the button's title and classList, and the
// document body's classList. updateDarkMode() reads these as closure
// variables (toggleIcon, toggleButton, document), so we inject them as
// parameters of the wrapping function.
function makeDom() {
  const buttonClasses = new Set();
  const bodyClasses = new Set();
  const mkClassList = (set) => ({
    add: (...cls) => cls.forEach((c) => set.add(c)),
    remove: (...cls) => cls.forEach((c) => set.delete(c)),
  });
  return {
    toggleIcon: { textContent: "" },
    toggleButton: { title: "", classList: mkClassList(buttonClasses) },
    document: { body: { classList: mkClassList(bodyClasses) } },
    buttonClasses,
    bodyClasses,
  };
}

// Build a runnable copy of the production updateDarkMode() bound to the
// given DOM mock, then invoke it with `preference`. Executes the REAL
// source statements — not a regex over them.
function runUpdateDarkMode(dom, preference) {
  const fnText = extractUpdateDarkMode(readIndexJs());
  const factory = new Function(
    "document",
    "toggleIcon",
    "toggleButton",
    `${fnText}\nreturn updateDarkMode;`,
  );
  const updateDarkMode = factory(dom.document, dom.toggleIcon, dom.toggleButton);
  updateDarkMode(preference);
  return dom;
}

test("dark mode toggle: light state renders the sun emoji", () => {
  const dom = runUpdateDarkMode(makeDom(), "light");
  assert.equal(
    dom.toggleIcon.textContent,
    LIGHT_EMOJI,
    `light state should render ${LIGHT_EMOJI}, got ${
      JSON.stringify(dom.toggleIcon.textContent)
    }`,
  );
});

test("dark mode toggle: dark state renders the crescent-moon emoji", () => {
  const dom = runUpdateDarkMode(makeDom(), "dark");
  assert.equal(
    dom.toggleIcon.textContent,
    DARK_EMOJI,
    `dark state should render ${DARK_EMOJI}, got ${
      JSON.stringify(dom.toggleIcon.textContent)
    }`,
  );
});

test("dark mode toggle: auto state renders the first-quarter-moon emoji", () => {
  const dom = runUpdateDarkMode(makeDom(), "auto");
  assert.equal(
    dom.toggleIcon.textContent,
    AUTO_EMOJI,
    `auto state should render ${AUTO_EMOJI}, got ${
      JSON.stringify(dom.toggleIcon.textContent)
    }`,
  );
});

test("dark mode toggle: unknown preference falls back to the auto emoji", () => {
  // The default icon (set when the button is created) is the auto state,
  // because the stored preference defaults to "auto" and any unrecognised
  // value must resolve to the same auto rendering. This replaces the old
  // "default icon" source grep with the observable fallback behaviour.
  const dom = runUpdateDarkMode(makeDom(), "totally-unknown");
  assert.equal(
    dom.toggleIcon.textContent,
    AUTO_EMOJI,
    `unknown preference should fall back to the auto emoji (${AUTO_EMOJI}), got ${
      JSON.stringify(dom.toggleIcon.textContent)
    }`,
  );
});

test("dark mode toggle: no state renders a bare single-letter label", () => {
  // Stronger than the old absence-grep: this checks the RENDERED glyph for
  // every state, so a single-letter label produced by any code path or
  // spelling is caught — not just one literal `toggleIcon.textContent = "L"`.
  const legacy = new Set(["L", "D", "A"]);
  for (const preference of ["light", "dark", "auto", "unknown"]) {
    const dom = runUpdateDarkMode(makeDom(), preference);
    assert.ok(
      !legacy.has(dom.toggleIcon.textContent),
      `${preference} state must not render a bare single-letter label, got ${
        JSON.stringify(dom.toggleIcon.textContent)
      }`,
    );
  }
});
