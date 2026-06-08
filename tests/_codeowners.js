// Minimal CODEOWNERS parser + matcher.
//
// Issue #75: the repository ships privileged GitHub Actions workflows
// (id-token: write OIDC, CODECOV_TOKEN, SEMGREP_APP_TOKEN, GITLEAKS_LICENSE,
// create-pull-request) but had no CODEOWNERS file, so `.github/workflows/`
// had no required reviewer. These helpers parse a CODEOWNERS file into
// structured rules and resolve the owners GitHub would assign to a given
// path, so the regression tests can assert on matching behaviour rather
// than the raw file text.
//
// GitHub semantics implemented here:
//   - `#` begins a comment; blank lines are ignored.
//   - Each rule is `pattern owner [owner ...]`.
//   - The LAST matching rule in the file wins (later rules override
//     earlier ones).
//   - A leading `/` anchors the pattern to the repository root.
//   - A trailing `/` matches everything inside that directory.
//   - `*` matches within a path segment; `**` matches across segments.
//
// Australian English: behaviour, organisation.

import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());

// Locations GitHub recognises for a CODEOWNERS file, in precedence order.
const CODEOWNERS_LOCATIONS = [
  ".github/CODEOWNERS",
  "CODEOWNERS",
  "docs/CODEOWNERS",
];

// Resolve the active CODEOWNERS path, or null when none exists.
export function codeownersPath(root = REPO_ROOT) {
  for (const rel of CODEOWNERS_LOCATIONS) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

// Parse CODEOWNERS text into an ordered array of { pattern, owners } rules.
export function parseCodeowners(text) {
  const rules = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const withoutComment = stripComment(line).trim();
    if (withoutComment === "") continue;
    const parts = withoutComment.split(/\s+/);
    const [pattern, ...owners] = parts;
    rules.push({ pattern, owners });
  }
  return rules;
}

// Resolve the owners GitHub would assign to `filePath` (the last matching
// rule wins). Returns [] when no rule matches.
export function ownersFor(rules, filePath) {
  const normalised = filePath.startsWith("/") ? filePath : `/${filePath}`;
  let owners = [];
  for (const rule of rules) {
    if (matchesPattern(rule.pattern, normalised)) {
      owners = rule.owners;
    }
  }
  return owners;
}

// --------------------------------------------------------------------
// Internals
// --------------------------------------------------------------------

function stripComment(line) {
  const hash = line.indexOf("#");
  return hash === -1 ? line : line.slice(0, hash);
}

// Match a CODEOWNERS pattern against an absolute (leading-slash) path.
export function matchesPattern(pattern, absolutePath) {
  const dirMatch = pattern.endsWith("/");
  // Anchor: a leading slash, or any pattern containing a mid-string
  // slash, is anchored to the root. A bare name (no slash) matches at
  // any depth.
  const hasSlash = pattern.replace(/^\//, "").replace(/\/$/, "").includes("/");
  let regexSource = globToRegex(pattern);

  if (pattern.startsWith("/") || hasSlash) {
    // Anchored to the repository root (paths carry a leading slash).
    regexSource = "^/" + regexSource;
  } else {
    // Unanchored bare name matches at any directory depth.
    regexSource = "(^|/)" + regexSource;
  }

  if (dirMatch) {
    // A directory pattern matches the directory and everything beneath.
    regexSource += ".*";
  } else {
    // A file/glob pattern matches the path exactly or as a directory
    // prefix (GitHub treats `foo` as matching `foo/bar`).
    regexSource += "(/.*)?$";
  }

  return new RegExp(regexSource).test(absolutePath);
}

// Translate the supported glob subset into a regex fragment. Escapes
// regex metacharacters, then expands `**`, `*` and `?`.
function globToRegex(pattern) {
  let p = pattern;
  if (p.startsWith("/")) p = p.slice(1);
  if (p.endsWith("/")) p = p.slice(0, -1);

  let out = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*") {
      if (p[i + 1] === "*") {
        out += ".*";
        i++;
        // Skip a slash immediately following `**`.
        if (p[i + 1] === "/") i++;
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(c)) {
      out += "\\" + c;
    } else {
      out += c;
    }
  }
  return out;
}
