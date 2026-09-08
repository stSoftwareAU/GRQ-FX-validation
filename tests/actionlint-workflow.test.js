// Regression tests for issue #119: the repository had no CI lint gate
// for its GitHub Actions workflows, so a syntax error, an invalid
// expression or a shell bug inside a `run:` block could land on
// Develop unnoticed. `.github/workflows/actionlint.yml` runs actionlint
// over .github/workflows/ on every pull request; these tests parse that
// workflow and assert on its structured fields so the gate cannot be
// weakened or removed silently.
//
// Australian English: behaviour, colour, organisation.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadWorkflow, workflowPath } from "./_workflow-yaml.js";

const WORKFLOW = "actionlint.yml";
const SHA_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

function job() {
  return loadWorkflow(WORKFLOW).jobs.actionlint;
}

function stepScripts() {
  return job().steps
    .filter((s) => s && typeof s.run === "string")
    .map((s) => s.run);
}

test("actionlint workflow file exists", () => {
  assert.ok(
    fs.existsSync(workflowPath(WORKFLOW)),
    `Expected workflow at ${workflowPath(WORKFLOW)}`,
  );
});

test("actionlint workflow runs on pull requests", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.equal(wf.name, "Actionlint");
  assert.ok(
    wf.on && "pull_request" in wf.on,
    "the lint gate must run on pull_request so regressions fail the build",
  );
});

test("actionlint workflow cancels superseded runs", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.ok(wf.concurrency, "expected a top-level concurrency block");
  assert.match(
    String(wf.concurrency.group),
    /\$\{\{\s*github\.workflow\s*\}\}-\$\{\{\s*github\.ref\s*\}\}/,
    "concurrency group must be keyed on workflow + ref",
  );
  assert.equal(wf.concurrency["cancel-in-progress"], true);
});

test("actionlint workflow uses least-privilege permissions", () => {
  const wf = loadWorkflow(WORKFLOW);
  const contents = wf.jobs.actionlint.permissions?.contents ??
    wf.permissions?.contents;
  assert.equal(
    contents,
    "read",
    "the linter only reads the checkout; contents: read is sufficient",
  );
});

test("actionlint job is bounded by a timeout and runs on ubuntu-latest", () => {
  const j = job();
  assert.equal(j["runs-on"], "ubuntu-latest");
  const timeout = j["timeout-minutes"];
  assert.ok(
    Number.isInteger(timeout) && timeout >= 1 && timeout <= 60,
    `timeout-minutes must be an explicit cap between 1 and 60 (saw '${timeout}')`,
  );
});

test("actionlint workflow pins actions/checkout to a commit SHA", () => {
  const step = job().steps.find(
    (s) => typeof s?.uses === "string" && s.uses.startsWith("actions/checkout@"),
  );
  assert.ok(step, "expected an actions/checkout step");
  const ref = step.uses.split("@")[1];
  assert.match(
    ref,
    SHA_RE,
    `actions/checkout must be pinned to a 40-character commit SHA (saw '${ref}')`,
  );
});

test("actionlint release is pinned to a version and a SHA-256 digest", () => {
  const env = job().env ?? {};
  assert.match(
    String(env.ACTIONLINT_VERSION),
    /^\d+\.\d+\.\d+$/,
    "ACTIONLINT_VERSION must pin an exact release, not a floating ref",
  );
  assert.match(
    String(env.ACTIONLINT_SHA256),
    SHA256_RE,
    "ACTIONLINT_SHA256 must be the 64-character digest of the release tarball",
  );
});

test("the download step verifies the checksum and fails loud", () => {
  const install = stepScripts().find((run) => run.includes("sha256sum"));
  assert.ok(install, "expected an install step that verifies the download");
  assert.ok(
    install.includes("set -euo pipefail"),
    "the install script must abort on the first failure",
  );
  assert.ok(
    install.includes("sha256sum --check --strict"),
    "a tampered tarball must fail the job, not install silently",
  );
  assert.ok(
    install.includes("--fail"),
    "curl must fail on an HTTP error rather than saving an error page",
  );
});

test("actionlint workflow actually invokes actionlint", () => {
  const scripts = stepScripts();
  assert.ok(
    scripts.some((run) => /(^|\s|\/)actionlint\s+-color/.test(run)),
    "expected a step invoking `actionlint -color` so workflow errors fail CI",
  );
});
