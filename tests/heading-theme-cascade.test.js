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

const STYLES_CSS = path.join(process.cwd(), "docs", "styles.css");

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Flatten the stylesheet into a list of style rules, each tagged with the
// stack of at-rule contexts it lives inside ('dark' for
// prefers-color-scheme: dark, 'other' for anything else).
function parseRules(css) {
  css = stripComments(css);
  const rules = [];
  const stack = [];
  let i = 0;
  const n = css.length;
  let buf = "";
  let order = 0;
  while (i < n) {
    const ch = css[i];
    if (ch === "{") {
      const prelude = buf.trim();
      buf = "";
      if (prelude.startsWith("@")) {
        let kind = "other";
        if (
          /^@media/i.test(prelude) &&
          /prefers-color-scheme\s*:\s*dark/i.test(prelude)
        ) {
          kind = "dark";
        }
        stack.push(kind);
        i++;
        continue;
      }
      // Plain style rule — consume its declaration block.
      let depth = 1;
      let j = i + 1;
      let body = "";
      while (j < n && depth > 0) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") {
          depth--;
          if (depth === 0) break;
        }
        if (depth > 0) body += css[j];
        j++;
      }
      rules.push({ selector: prelude, block: body, stack: [...stack], order: order++ });
      i = j + 1;
      continue;
    }
    if (ch === "}") {
      stack.pop();
      i++;
      buf = "";
      continue;
    }
    buf += ch;
    i++;
  }
  return rules;
}

function mediaMatches(stack, prefersDark) {
  for (const frame of stack) {
    if (frame === "other") return false;
    if (frame === "dark" && !prefersDark) return false;
  }
  return true;
}

// Match a single compound selector (e.g. `body:not(.dark-mode-forced)`)
// against a simple element model. Pseudo-classes other than :not (e.g.
// :hover) are treated as non-matching for this static check.
function matchCompound(compound, el) {
  const re = /(:not\([^)]*\))|([.#]?[A-Za-z][\w-]*)|(:[A-Za-z-]+)/g;
  let m;
  while ((m = re.exec(compound))) {
    const tok = m[0];
    if (tok.startsWith(":not(")) {
      const inner = tok.slice(5, -1).trim();
      if (matchCompound(inner, el)) return false;
    } else if (tok.startsWith(".")) {
      if (!el.classes.has(tok.slice(1))) return false;
    } else if (tok.startsWith("#")) {
      if (el.id !== tok.slice(1)) return false;
    } else if (tok.startsWith(":")) {
      return false; // :hover and friends — not the resting state under test
    } else if (!tok.startsWith("#") && !tok.startsWith(".")) {
      if (el.tag !== tok) return false; // type selector
    }
  }
  return true;
}

// Match a full (descendant-combinator) selector. Left compounds are matched
// against the body ancestor; the right-most compound against the target.
function matchComplex(selector, target, body) {
  const parts = selector.trim().split(/\s+/);
  const right = parts[parts.length - 1];
  if (!matchCompound(right, target)) return false;
  for (let k = 0; k < parts.length - 1; k++) {
    if (!matchCompound(parts[k], body)) return false;
  }
  return true;
}

function specificity(selector) {
  const flat = selector.replace(/:not\(([^)]*)\)/g, " $1 ");
  const a = (flat.match(/#[\w-]+/g) || []).length;
  const classes = (flat.match(/\.[\w-]+/g) || []).length;
  const pseudo = (flat.match(/(?<![\w-]):[\w-]+(?!\()/g) || []).length;
  const types = (flat.match(/(?<![.#:\w-])[A-Za-z][\w-]*/g) || []).length;
  return [a, classes + pseudo, types];
}

function cmpSpec(x, y) {
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return 0;
}

// Last declaration of an *exact* property name in a block (so `background`
// does not pick up `background-image`/`background-color`).
function getDecl(block, prop) {
  let found = null;
  for (const d of block.split(";")) {
    const idx = d.indexOf(":");
    if (idx < 0) continue;
    if (d.slice(0, idx).trim().toLowerCase() !== prop) continue;
    let val = d.slice(idx + 1).trim();
    const important = /!important/i.test(val);
    val = val.replace(/!important/i, "").trim();
    found = { value: val, important };
  }
  return found;
}

// Resolve the winning value of `prop` on `target` for a scenario.
function resolve(rules, target, body, prefersDark, prop) {
  const cands = [];
  for (const r of rules) {
    if (!mediaMatches(r.stack, prefersDark)) continue;
    const selList = r.selector.split(",");
    let best = null;
    for (const s of selList) {
      if (!matchComplex(s, target, body)) continue;
      const sp = specificity(s);
      if (!best || cmpSpec(sp, best) > 0) best = sp;
    }
    if (!best) continue;
    const decl = getDecl(r.block, prop);
    if (!decl) continue;
    cands.push({ ...decl, spec: best, order: r.order });
  }
  if (!cands.length) return null;
  cands.sort((x, y) => {
    if (x.important !== y.important) return x.important ? 1 : -1;
    const c = cmpSpec(x.spec, y.spec);
    if (c !== 0) return c;
    return x.order - y.order;
  });
  return cands[cands.length - 1].value;
}

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
const bodyWith = (...cls) => ({ tag: "body", id: null, classes: new Set(cls) });

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
