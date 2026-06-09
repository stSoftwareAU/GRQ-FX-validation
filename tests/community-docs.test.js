// Regression tests for the community-health documents (issue #79).
//
// The project was missing two standard open-source documents:
//   - CONTRIBUTING.md — how to set up the toolchain, run ./quality.sh,
//     follow the version-bump hook and open a PR against Develop.
//   - CHANGELOG.md — a Keep a Changelog history seeded with Unreleased.
//
// These tests assert on the parsed structure of those files rather than
// their raw bytes, so reformatting does not break the suite.
//
// Australian English: behaviour, organisation.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  findDoc,
  hasSection,
  sectionTitles,
  topHeading,
} from "./_community_docs.js";

function read(name) {
  const p = findDoc(name);
  assert.ok(p, `expected ${name} at the repository root, .github or docs`);
  return fs.readFileSync(p, "utf8");
}

// --- CONTRIBUTING.md --------------------------------------------------

test("CONTRIBUTING.md exists at a recognised location", () => {
  assert.ok(findDoc("CONTRIBUTING.md"), "CONTRIBUTING.md is missing");
});

test("CONTRIBUTING.md has a top-level heading", () => {
  assert.ok(topHeading(read("CONTRIBUTING.md")), "expected a `# ` heading");
});

test("CONTRIBUTING.md documents the quality gate", () => {
  const text = read("CONTRIBUTING.md");
  assert.match(
    text,
    /\.\/quality\.sh/,
    "contributors must be told to run ./quality.sh",
  );
});

test("CONTRIBUTING.md documents the version-bump pre-commit hook", () => {
  const text = read("CONTRIBUTING.md");
  assert.match(
    text,
    /pre-commit/,
    "the scripts/pre-commit version-bump hook must be explained",
  );
  assert.match(
    text,
    /setup-hooks\.sh/,
    "contributors must be told how to install the hook",
  );
});

test("CONTRIBUTING.md documents the PR workflow against Develop", () => {
  const text = read("CONTRIBUTING.md");
  assert.match(text, /Develop/, "the base branch (Develop) must be named");
});

test("CONTRIBUTING.md mentions both Deno and Node toolchains", () => {
  const text = read("CONTRIBUTING.md");
  assert.match(text, /Deno/, "Deno toolchain must be documented");
  assert.match(text, /Node/, "Node toolchain must be documented");
});

// --- CHANGELOG.md -----------------------------------------------------

test("CHANGELOG.md exists at a recognised location", () => {
  assert.ok(findDoc("CHANGELOG.md"), "CHANGELOG.md is missing");
});

test("CHANGELOG.md has a top-level heading", () => {
  assert.ok(topHeading(read("CHANGELOG.md")), "expected a `# ` heading");
});

test("CHANGELOG.md follows the Keep a Changelog format", () => {
  const text = read("CHANGELOG.md");
  assert.match(
    text,
    /keepachangelog\.com/,
    "the Keep a Changelog reference must be present",
  );
  assert.match(text, /semver\.org/, "the SemVer reference must be present");
});

test("CHANGELOG.md is seeded with an Unreleased section", () => {
  const text = read("CHANGELOG.md");
  assert.ok(
    hasSection(text, "Unreleased"),
    `expected an "## [Unreleased]" section, saw: ${sectionTitles(text).join(", ")}`,
  );
});

// --- helper unit tests with synthetic data ----------------------------

test("topHeading returns the first level-one heading", () => {
  assert.equal(topHeading("intro\n# Title\n## Sub\n"), "Title");
  assert.equal(topHeading("## Only a sub-heading\n"), null);
});

test("sectionTitles lists level-two headings in order", () => {
  assert.deepEqual(
    sectionTitles("# T\n## [Unreleased]\n## [1.0.0] - 2025-01-01\n"),
    ["[Unreleased]", "[1.0.0] - 2025-01-01"],
  );
});

test("hasSection matches case-insensitively on a substring", () => {
  const text = "## [Unreleased]\n";
  assert.ok(hasSection(text, "unreleased"));
  assert.ok(!hasSection(text, "Added"));
});
