// Minimal YAML parser for GitHub Actions workflow files.
//
// Issue #42: tests under tests/*-workflow.test.js used to assert on the
// raw YAML text with regular expressions. That is a textbook HOW-test:
// it passes when the YAML mentions the right words and fails when a
// maintainer reformats the file, even though the CI gate is unchanged.
// This helper parses the workflow YAML into a JavaScript object so the
// tests can assert on the structured behaviour the workflow describes
// (job name, permissions, step `uses` refs, env wiring, etc.) rather
// than the surface text.
//
// The parser handles the subset of YAML actually used by GitHub Actions
// workflows in this repository:
//   - block mappings with scalar / mapping / sequence values
//   - block sequences (- item) of scalars and mappings
//   - flow sequences ["main", "master"]
//   - quoted scalars (single + double)
//   - literal block scalars (`|`) used by multi-line `run:` blocks
//   - line comments (`#`) outside quoted strings
//   - integers, booleans, null
//
// Australian English: behaviour, colour, organisation.

import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const WORKFLOW_DIR = path.join(REPO_ROOT, ".github", "workflows");

// --------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------

export function workflowPath(name) {
  return path.join(WORKFLOW_DIR, name);
}

export function loadWorkflow(name) {
  const raw = fs.readFileSync(workflowPath(name), "utf8");
  return parseYaml(raw);
}

// Return every `uses:` reference declared anywhere in the workflow as
// { action, ref } pairs. Skips empty / null step entries defensively.
export function collectActionRefs(workflow) {
  const refs = [];
  const jobs = workflow.jobs ?? {};
  for (const job of Object.values(jobs)) {
    for (const step of job?.steps ?? []) {
      if (step && typeof step.uses === "string") {
        const at = step.uses.lastIndexOf("@");
        if (at !== -1) {
          refs.push({
            action: step.uses.slice(0, at),
            ref: step.uses.slice(at + 1),
          });
        }
      }
    }
  }
  return refs;
}

// --------------------------------------------------------------------
// Parser
// --------------------------------------------------------------------

export function parseYaml(text) {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  // Strip whole-line comments and trailing comments outside of quoted
  // strings. Multi-line literal blocks (`|`) preserve `#` so we must
  // strip comments lazily during parsing instead. We do strip pure
  // whole-line comments here because they never appear inside a block
  // literal: an indented `#` line is treated as content of the literal
  // only when it sits at or beyond the block's indent.
  const tokens = tokenise(lines);
  const { value } = parseBlockNode(tokens, 0, 0, false);
  return value;
}

function tokenise(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    out.push({ raw, lineNum: i + 1 });
  }
  return out;
}

// Strip a trailing comment from a single non-literal line. Respects
// single + double quoted strings so a `#` inside a quoted value is not
// treated as a comment.
function stripTrailingComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (!inDouble && c === "'") inSingle = !inSingle;
    else if (!inSingle && c === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && c === "#") {
      // Must be preceded by whitespace (or start of line) to count as
      // an inline comment delimiter — YAML rule.
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i);
    }
  }
  return line;
}

function indentOf(line) {
  const m = line.match(/^( *)/);
  return m ? m[1].length : 0;
}

function isBlank(line) {
  return /^\s*$/.test(line) || /^\s*#/.test(line);
}

// Parse the block node starting at tokens[index], whose minimum indent
// is `minIndent` and whose first line is at `firstLine` (used for
// inline-mapping continuations after a `- ` sequence marker).
//
// Returns { value, next } where `next` is the token index after the
// block ends.
function parseBlockNode(tokens, index, minIndent) {
  // Skip blank / comment-only lines.
  while (index < tokens.length && isBlank(tokens[index].raw)) index++;
  if (index >= tokens.length) return { value: null, next: index };

  const first = tokens[index];
  const indent = indentOf(first.raw);
  if (indent < minIndent) return { value: null, next: index };

  const trimmed = stripTrailingComment(first.raw).slice(indent);

  // Block sequence: `- item`.
  if (/^- (?!$)/.test(trimmed) || /^-$/.test(trimmed)) {
    return parseSequence(tokens, index, indent);
  }

  // Block mapping: `key:` or `key: value`.
  if (/^[^\s:#][^:]*:(\s|$)/.test(trimmed) || /^"[^"]*":(\s|$)/.test(trimmed) ||
      /^'[^']*':(\s|$)/.test(trimmed)) {
    return parseMapping(tokens, index, indent);
  }

  // Bare scalar line — rare at top level but handle defensively.
  return { value: parseScalar(trimmed), next: index + 1 };
}

function parseSequence(tokens, index, indent) {
  const items = [];
  while (index < tokens.length) {
    if (isBlank(tokens[index].raw)) { index++; continue; }
    const line = tokens[index].raw;
    const lineIndent = indentOf(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) break; // belongs to a parent, defensive
    const trimmed = stripTrailingComment(line).slice(indent);
    if (!/^-(\s|$)/.test(trimmed)) break;

    // After the `- ` marker the rest of the line is the first entry.
    const afterDash = trimmed.replace(/^-\s*/, "");
    if (afterDash === "") {
      // Item body sits on subsequent lines, indented further than the
      // dash itself.
      index++;
      const { value, next } = parseBlockNode(tokens, index, indent + 1);
      items.push(value);
      index = next;
      continue;
    }

    // Inline form. The dash + space consumes two columns, so any
    // continuation keys for a mapping inside the sequence are indented
    // by indent + 2.
    const itemIndent = indent + 2;
    // Replace the dash + space with two spaces so the rest of the
    // sub-block can be parsed by the same machinery.
    const rewritten = " ".repeat(itemIndent) + afterDash;
    const synthetic = [{ raw: rewritten, lineNum: tokens[index].lineNum }];
    let scan = index + 1;
    while (scan < tokens.length) {
      if (isBlank(tokens[scan].raw)) {
        synthetic.push(tokens[scan]);
        scan++;
        continue;
      }
      const scanIndent = indentOf(tokens[scan].raw);
      if (scanIndent < itemIndent) break;
      const scanLine = stripTrailingComment(tokens[scan].raw);
      // Stop at the next sequence dash at the parent indent.
      if (scanIndent === indent && /^-(\s|$)/.test(scanLine.slice(indent))) break;
      synthetic.push(tokens[scan]);
      scan++;
    }
    const { value } = parseBlockNode(synthetic, 0, itemIndent);
    items.push(value);
    index = scan;
  }
  return { value: items, next: index };
}

function parseMapping(tokens, index, indent) {
  const map = {};
  while (index < tokens.length) {
    if (isBlank(tokens[index].raw)) { index++; continue; }
    const line = tokens[index].raw;
    const lineIndent = indentOf(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) {
      // Defensive: a deeper line that does not belong to a known parent
      // simply ends the current mapping.
      break;
    }
    const trimmed = stripTrailingComment(line).slice(indent);
    const m = trimmed.match(/^("([^"]*)"|'([^']*)'|([^:#][^:]*?))\s*:(\s|$)(.*)$/);
    if (!m) break;
    const key = m[2] ?? m[3] ?? m[4];
    const rest = (m[6] ?? "").trim();

    if (rest === "" || rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
      // Empty rest -> nested block (mapping / sequence / null).
      // Literal/folded block indicator -> consume indented body as a
      // single string.
      if (rest.startsWith("|") || rest.startsWith(">")) {
        const { value, next } = readLiteralBlock(tokens, index + 1, indent, rest);
        map[key] = value;
        index = next;
      } else {
        // Look ahead for child content at deeper indent.
        let look = index + 1;
        while (look < tokens.length && isBlank(tokens[look].raw)) look++;
        if (look >= tokens.length) {
          map[key] = null;
          index = look;
        } else {
          const childIndent = indentOf(tokens[look].raw);
          if (childIndent <= indent) {
            map[key] = null;
            index = index + 1;
          } else {
            const { value, next } = parseBlockNode(tokens, look, childIndent);
            map[key] = value;
            index = next;
          }
        }
      }
    } else {
      map[key] = parseScalar(rest);
      index++;
    }
  }
  return { value: map, next: index };
}

// Read a literal (`|`) or folded (`>`) block scalar. We treat both
// alike for the purposes of these tests — preserve newline content and
// strip the common leading indent.
function readLiteralBlock(tokens, index, parentIndent, indicator) {
  const lines = [];
  let blockIndent = -1;
  while (index < tokens.length) {
    const raw = tokens[index].raw;
    if (raw.trim() === "") {
      lines.push("");
      index++;
      continue;
    }
    const ind = indentOf(raw);
    if (ind <= parentIndent) break;
    if (blockIndent === -1) blockIndent = ind;
    lines.push(raw.slice(blockIndent));
    index++;
  }
  // Trim trailing blank lines (block-strip indicator `|-` removes the
  // final newline; we normalise so trailing blanks do not pollute
  // assertions).
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  const sep = indicator.startsWith(">") ? " " : "\n";
  return { value: lines.join(sep), next: index };
}

function parseScalar(text) {
  const s = text.trim();
  if (s === "" || s === "~" || s === "null") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
  if (s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  // Flow sequence: ["a", "b"] or [a, b]
  if (s.startsWith("[") && s.endsWith("]")) {
    const inside = s.slice(1, -1).trim();
    if (inside === "") return [];
    return splitFlow(inside).map((part) => parseScalar(part));
  }
  // Flow mapping: { a: 1, b: 2 } — workflows do not really use this.
  return s;
}

function splitFlow(text) {
  const parts = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!inDouble && c === "'") inSingle = !inSingle;
    else if (!inSingle && c === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (c === "[" || c === "{") depth++;
      else if (c === "]" || c === "}") depth--;
      else if (c === "," && depth === 0) {
        parts.push(text.slice(start, i).trim());
        start = i + 1;
      }
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}
