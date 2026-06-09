// Regression tests for the security policy document (issue #84).
//
// SCR-RUNBOOK: the project had no SECURITY.md, so there was no documented
// security-disclosure contact and no emergency-bump procedure for responding
// to a compromised dependency. These tests assert on the parsed structure of
// SECURITY.md rather than its raw bytes, so reformatting does not break the
// suite.
//
// Australian English: behaviour, organisation.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { findDoc, hasSection, sectionTitles, topHeading } from "./_community_docs.js";

function read(name) {
  const p = findDoc(name);
  assert.ok(p, `expected ${name} at the repository root, .github or docs`);
  return fs.readFileSync(p, "utf8");
}

test("SECURITY.md exists at a recognised location", () => {
  assert.ok(findDoc("SECURITY.md"), "SECURITY.md is missing");
});

test("SECURITY.md has a top-level heading", () => {
  assert.ok(topHeading(read("SECURITY.md")), "expected a `# ` heading");
});

test("SECURITY.md names a disclosure contact address", () => {
  const text = read("SECURITY.md");
  assert.match(
    text,
    /[A-Za-z0-9._%+-]+@stsoftware\.com\.au/,
    "a disclosure contact email (@stsoftware.com.au) must be present",
  );
});

test("SECURITY.md has a reporting / disclosure section", () => {
  const text = read("SECURITY.md");
  assert.ok(
    hasSection(text, "report") || hasSection(text, "disclos"),
    `expected a reporting/disclosure section, saw: ${sectionTitles(text).join(", ")}`,
  );
});

test("SECURITY.md documents an emergency-bump procedure", () => {
  const text = read("SECURITY.md");
  assert.ok(
    hasSection(text, "emergency"),
    `expected an emergency-bump section, saw: ${sectionTitles(text).join(", ")}`,
  );
});

test("SECURITY.md emergency-bump steer references the Deno toolchain", () => {
  const text = read("SECURITY.md");
  assert.match(text, /deno outdated/, "the deno outdated update step must be documented");
  assert.match(text, /deno audit/, "the deno audit verification step must be documented");
  assert.match(text, /\.\/quality\.sh/, "the ./quality.sh verification step must be documented");
});
