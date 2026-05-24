// Regression tests that pin documentation to the shipped code (issue #32).
//
// Historical "summary" files in the repository root had drifted from the
// codebase: README.md referenced removed pages (list.html / list.css), the
// Yahoo Finance docs still listed `thingproxy.freeboard.io` after it was
// removed in #24, and the post-migration summary documents read as if they
// described the live architecture.
//
// These tests fail if any of those drift conditions reappears.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const repoRoot = new URL("..", import.meta.url);

const readDoc = (relative) =>
  readFileSync(new URL(relative, repoRoot), "utf8");

test("README does not reference removed list.html / list.css", () => {
  const readme = readDoc("README.md");
  assert.ok(
    !/list\.html/i.test(readme),
    "README references list.html which was removed during the JAMstack consolidation",
  );
  assert.ok(
    !/list\.css/i.test(readme),
    "README references list.css which was removed during the JAMstack consolidation",
  );
});

test("README documents the current file layout", () => {
  const readme = readDoc("README.md");
  // Files/dirs that actually exist in the current tree.
  for (const path of [
    "docs/index.html",
    "docs/index.js",
    "docs/index.json",
    "docs/manifest.json",
    "docs/sw.js",
    "docs/data/",
    "tests/",
    "quality.sh",
  ]) {
    assert.ok(
      readme.includes(path),
      `README should mention ${path} in the file structure`,
    );
  }
});

test("README uses Australian English in the new content", () => {
  const readme = readDoc("README.md");
  assert.ok(
    !/\bVisualize\b/.test(readme),
    "README should use Australian spelling 'Visualise', not 'Visualize'",
  );
});

test("Yahoo Finance docs reflect the two-proxy allowlist (issue #24)", () => {
  for (const path of [
    "YAHOO_FINANCE_INTEGRATION.md",
    "ENHANCED_YAHOO_FINANCE.md",
  ]) {
    const body = readDoc(path);
    assert.ok(
      !/thingproxy/i.test(body),
      `${path} still mentions thingproxy.freeboard.io which was removed in #24`,
    );
    assert.ok(
      /allorigins\.win/.test(body) && /corsproxy\.io/.test(body),
      `${path} should document the active CORS proxies (allorigins.win, corsproxy.io)`,
    );
  }
});

test("Outdated summary documents carry a historical-document banner", () => {
  const banner = "Historical document";
  for (const path of [
    "SETUP_SUMMARY.md",
    "REFACTORING_SUMMARY.md",
    "JAMSTACK_MIGRATION.md",
    "JAVASCRIPT_EXTRACTION.md",
  ]) {
    const body = readDoc(path);
    assert.ok(
      body.includes(banner),
      `${path} should open with a 'Historical document' banner so readers know it predates the current code`,
    );
  }
});
