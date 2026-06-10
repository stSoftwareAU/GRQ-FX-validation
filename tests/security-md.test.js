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

// Issue #77: a GitHub-recognised disclosure policy must also state the
// expected initial response time and which versions are supported, so a
// reporter knows what to expect and which release a fix will land on.

test("SECURITY.md states an expected initial response time", () => {
  const text = read("SECURITY.md");
  assert.match(
    text,
    /\b(?:\d+|one|two|three|four|five|several)\s+business days?\b/i,
    "an expected initial response time (e.g. 'within two business days') must be present",
  );
});

test("SECURITY.md documents supported versions", () => {
  const text = read("SECURITY.md");
  assert.ok(
    hasSection(text, "supported"),
    `expected a supported-versions section, saw: ${sectionTitles(text).join(", ")}`,
  );
});

test("SECURITY.md supported-versions section includes a table", () => {
  const text = read("SECURITY.md");
  // A GitHub-flavoured markdown table has a header separator row of
  // pipes and dashes, e.g. `| --- | --- |`.
  assert.match(
    text,
    /\|\s*-+\s*\|/,
    "the supported-versions section must contain a markdown table",
  );
});

// Issue #85 (SCR-QUARANTINE-OVERRIDE): renovate.json imposes a 24-hour
// minimumReleaseAge quarantine on external dependency updates. For an
// actively-exploited CVE that window can delay an urgent fix, so the
// emergency procedure must document an explicit, agreed fast-lane to
// bypass the quarantine rather than leaving the team to improvise.

// Collapse markdown to a single whitespace-normalised line so a
// regex can assert two concepts co-occur within a short window
// regardless of line wrapping.
function flatten(text) {
  return text.replace(/\s+/g, " ");
}

test("SECURITY.md frames the override around an actively-exploited CVE", () => {
  const text = read("SECURITY.md");
  // The trigger for the fast-lane is an actively-exploited CVE, not the
  // broader "compromise disclosed" case the emergency-bump steps already
  // cover. Requiring the word makes the override's purpose unambiguous.
  assert.match(
    text,
    /exploit/i,
    "the override must state it applies to an actively-exploited CVE",
  );
});

test("SECURITY.md documents an explicit bypass of the 24-hour quarantine", () => {
  const flat = flatten(read("SECURITY.md"));
  // A bypass/override verb must sit close to the quarantine noun so the
  // document plainly states the quarantine MAY be overridden — not merely
  // that external packages "sit behind" it.
  assert.match(
    flat,
    /(?:bypass|override|skip|waive|fast[\s-]?lane)[^.]{0,80}quarantine|quarantine[^.]{0,80}(?:bypass|override|skip|waive|may be)/i,
    "the procedure must explicitly document bypassing/overriding the quarantine",
  );
  assert.match(
    flat,
    /24[\s-]?hour/i,
    "the override must reference the 24-hour quarantine window",
  );
});

test("SECURITY.md names the workflow_dispatch manual-trigger override path", () => {
  const text = read("SECURITY.md");
  assert.match(
    text,
    /workflow_dispatch/,
    "the override must name the workflow_dispatch manual update path",
  );
});

test("SECURITY.md keeps the audit + quality gate on the override path", () => {
  const flat = flatten(read("SECURITY.md"));
  // The fast-lane skips the waiting window, not the safety checks: a
  // bypassed PR must still pass deno audit and ./quality.sh.
  assert.match(flat, /deno audit/, "the override must still require deno audit");
  assert.match(flat, /\.\/quality\.sh/, "the override must still require ./quality.sh");
});

test("SECURITY.md requires review before merging an emergency bypass", () => {
  const text = read("SECURITY.md");
  // The fast-lane must not skip review — assert the override still
  // requires a reviewed pull request before merge.
  assert.match(
    text,
    /\breview/i,
    "the emergency override must still require a review before merge",
  );
});
