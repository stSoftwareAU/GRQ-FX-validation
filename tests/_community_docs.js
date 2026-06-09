// Shared helpers for the community-health document tests (issue #79).
//
// These parse CONTRIBUTING.md and CHANGELOG.md into a small structural
// model (top-level heading, H2 section titles) so the regression tests can
// assert on behaviour — "a section titled Unreleased exists" — rather than
// the raw file text. That keeps the suite stable across reformatting.
//
// Australian English: behaviour, organisation.

import fs from "node:fs";
import path from "node:path";

// Resolve a document at the repository root by name, returning its absolute
// path or null when absent. Mirrors how GitHub surfaces community-health
// files (CONTRIBUTING.md / CHANGELOG.md must live at the repo root, .github
// or docs to be recognised).
export function findDoc(name, root = repoRoot()) {
  for (const dir of [root, path.join(root, ".github"), path.join(root, "docs")]) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

// The repository root is two levels up from this file (tests/_community_docs.js).
export function repoRoot() {
  return path.resolve(new URL("..", import.meta.url).pathname);
}

// Extract the first ATX top-level heading (`# Title`) from markdown text.
// Returns the trimmed title, or null when there is no level-one heading.
export function topHeading(text) {
  for (const line of text.split("\n")) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match) return match[1];
  }
  return null;
}

// Extract the ordered list of level-two section titles (`## Section`).
export function sectionTitles(text) {
  const titles = [];
  for (const line of text.split("\n")) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) titles.push(match[1]);
  }
  return titles;
}

// True when any H2 section title contains the given substring (case-insensitive).
export function hasSection(text, needle) {
  const lower = needle.toLowerCase();
  return sectionTitles(text).some((t) => t.toLowerCase().includes(lower));
}
