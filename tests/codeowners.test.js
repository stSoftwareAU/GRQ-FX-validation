// Regression tests for CODEOWNERS coverage of privileged workflows
// (issue #75).
//
// The repository runs GitHub Actions workflows with id-token: write
// (OIDC) and several repository secrets. Without a CODEOWNERS rule
// covering `.github/workflows/`, a single compromised or self-approving
// account could edit a workflow that then runs with those privileges.
// These tests fail if the CODEOWNERS file is missing or stops covering
// the workflow / action definitions.
//
// They assert on parsed matching behaviour (via tests/_codeowners.js)
// rather than the raw file text, so reformatting the file does not
// break the suite.
//
// Australian English: behaviour, organisation.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  codeownersPath,
  matchesPattern,
  ownersFor,
  parseCodeowners,
} from "./_codeowners.js";

function loadRules() {
  const p = codeownersPath();
  assert.ok(p, "expected a CODEOWNERS file in one of the recognised locations");
  return parseCodeowners(fs.readFileSync(p, "utf8"));
}

test("a CODEOWNERS file exists in a recognised location", () => {
  assert.ok(
    codeownersPath(),
    "GitHub only reads CODEOWNERS from CODEOWNERS, .github/CODEOWNERS or docs/CODEOWNERS",
  );
});

test("CODEOWNERS assigns an owner to .github/workflows/ files", () => {
  const rules = loadRules();
  const owners = ownersFor(rules, ".github/workflows/ci.yml");
  assert.ok(
    owners.length > 0,
    "every file under .github/workflows/ must have a required code owner",
  );
});

test("CODEOWNERS covers every workflow file in the repository", () => {
  const rules = loadRules();
  const files = fs.readdirSync(".github/workflows");
  for (const file of files) {
    const owners = ownersFor(rules, `.github/workflows/${file}`);
    assert.ok(
      owners.length > 0,
      `workflow .github/workflows/${file} has no code owner`,
    );
  }
});

test("CODEOWNERS assigns an owner to .github/actions/ definitions", () => {
  const rules = loadRules();
  const owners = ownersFor(rules, ".github/actions/build/action.yml");
  assert.ok(
    owners.length > 0,
    "composite action definitions must also have a required code owner",
  );
});

test("every CODEOWNERS owner is a valid @user or @org/team handle", () => {
  const rules = loadRules();
  assert.ok(rules.length > 0, "CODEOWNERS must declare at least one rule");
  for (const { pattern, owners } of rules) {
    assert.ok(owners.length > 0, `rule '${pattern}' declares no owners`);
    for (const owner of owners) {
      assert.match(
        owner,
        /^@[A-Za-z0-9-]+(\/[A-Za-z0-9._-]+)?$/,
        `owner '${owner}' for pattern '${pattern}' is not a valid @handle`,
      );
    }
  }
});

// --- Parser / matcher unit tests with synthetic data -----------------

test("parseCodeowners ignores comments and blank lines", () => {
  const rules = parseCodeowners(
    "# a comment\n\n/.github/workflows/ @org/team\n   \n",
  );
  assert.equal(rules.length, 1);
  assert.equal(rules[0].pattern, "/.github/workflows/");
  assert.deepEqual(rules[0].owners, ["@org/team"]);
});

test("parseCodeowners captures multiple owners on one rule", () => {
  const rules = parseCodeowners("* @org/a @user-b");
  assert.deepEqual(rules[0].owners, ["@org/a", "@user-b"]);
});

test("parseCodeowners strips trailing inline comments", () => {
  const rules = parseCodeowners("/.github/ @org/team # owner review");
  assert.deepEqual(rules[0].owners, ["@org/team"]);
});

test("ownersFor lets the last matching rule win", () => {
  const rules = parseCodeowners(
    "* @org/default\n/.github/workflows/ @org/maintainers\n",
  );
  assert.deepEqual(
    ownersFor(rules, ".github/workflows/ci.yml"),
    ["@org/maintainers"],
  );
  assert.deepEqual(ownersFor(rules, "README.md"), ["@org/default"]);
});

test("ownersFor returns [] when no rule matches", () => {
  const rules = parseCodeowners("/.github/workflows/ @org/team");
  assert.deepEqual(ownersFor(rules, "README.md"), []);
});

test("matchesPattern handles anchored directory patterns", () => {
  assert.ok(matchesPattern("/.github/workflows/", "/.github/workflows/ci.yml"));
  assert.ok(!matchesPattern("/.github/workflows/", "/.github/actions/x.yml"));
});

test("matchesPattern handles unanchored bare names at any depth", () => {
  assert.ok(matchesPattern("*.yml", "/.github/workflows/ci.yml"));
});
