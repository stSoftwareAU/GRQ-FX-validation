// Shared CSS cascade resolver for theme/computed-style tests.
//
// Issue #70: theme-toggle-styling.test.js previously grepped JS and CSS
// *source text* (which property the implementation writes, the exact
// selector spelling). Those HOW-tests break on any behaviour-preserving
// refactor and pass for behaviour-breaking changes. The fix is to assert
// the *rendered* outcome — the declaration that actually WINS the cascade
// for a property on an element in a given theme state.
//
// This module factors out the small-but-real cascade resolver first
// written inline for issue #67 (heading-theme-cascade.test.js) so both
// the heading and toggle tests share one implementation (DRY).
//
// The resolver flattens a stylesheet into rules tagged with their at-rule
// context, matches descendant selectors against a simple element model,
// computes specificity + !important + source order, and returns the
// winning value of a property for a (target, body classes, OS scheme)
// scenario. Pseudo-class states such as :hover are treated as
// non-matching so we assert the resting (rendered) state.
//
// Australian English: behaviour, colour.

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Flatten the stylesheet into a list of style rules, each tagged with the
// stack of at-rule contexts it lives inside ('dark' for
// prefers-color-scheme: dark, 'other' for anything else).
export function parseRules(css) {
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
      rules.push({
        selector: prelude,
        block: body,
        stack: [...stack],
        order: order++,
      });
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
export function getDecl(block, prop) {
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
export function resolve(rules, target, body, prefersDark, prop) {
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

// Convenience: build a body element model with the given classes.
export function bodyWith(...cls) {
  return { tag: "body", id: null, classes: new Set(cls) };
}
