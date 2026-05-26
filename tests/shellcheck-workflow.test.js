// Regression tests for the ShellCheck Lint workflow (issue #5).
//
// Australian English: these tests verify the ShellCheck workflow file
// is present and well-formed so the shell-script quality gate cannot
// regress silently.
//
// Issue #42: assertions previously regex-matched the raw YAML text;
// they now parse the workflow into a JavaScript object and assert on
// its structured fields.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadWorkflow, workflowPath } from "./_workflow-yaml.js";

const WORKFLOW = "shellcheck.yml";
const SHA_RE = /^[0-9a-f]{40}$/;

test("shellcheck workflow file exists", () => {
  assert.ok(
    fs.existsSync(workflowPath(WORKFLOW)),
    `Expected workflow at ${workflowPath(WORKFLOW)}`,
  );
});

test("shellcheck workflow declares the expected name and PR trigger", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.equal(wf.name, "ShellCheck");
  assert.ok(
    wf.on && "pull_request" in wf.on,
    "workflow must run on pull_request events",
  );
});

test("shellcheck workflow uses pinned commit SHA for actions/checkout", () => {
  const wf = loadWorkflow(WORKFLOW);
  const step = wf.jobs.shellcheck.steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("actions/checkout@"),
  );
  assert.ok(step, "expected an actions/checkout step");
  const ref = step.uses.split("@")[1];
  assert.match(
    ref,
    SHA_RE,
    `actions/checkout must be pinned to a 40-character commit SHA (saw '${ref}')`,
  );
});

test("shellcheck workflow uses pinned commit SHA for ludeeus/action-shellcheck", () => {
  const wf = loadWorkflow(WORKFLOW);
  const step = wf.jobs.shellcheck.steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("ludeeus/action-shellcheck@"),
  );
  assert.ok(step, "expected a ludeeus/action-shellcheck step");
  const ref = step.uses.split("@")[1];
  assert.match(
    ref,
    SHA_RE,
    `ludeeus/action-shellcheck must be pinned to a 40-character commit SHA, not @master (saw '${ref}')`,
  );
  assert.notEqual(ref, "master", "must not reference the floating @master ref");
});

test("shellcheck workflow configures scandir and warning severity", () => {
  const wf = loadWorkflow(WORKFLOW);
  const step = wf.jobs.shellcheck.steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("ludeeus/action-shellcheck@"),
  );
  assert.ok(step.with, "shellcheck step must declare a `with:` block");
  assert.equal(step.with.scandir, ".", "scandir must be '.' (whole repo)");
  assert.equal(
    step.with.severity,
    "warning",
    "severity must be 'warning' (not 'error') to surface stylistic issues",
  );
});

test("shellcheck workflow uses least-privilege permissions", () => {
  const wf = loadWorkflow(WORKFLOW);
  const top = wf.permissions ?? {};
  const job = wf.jobs.shellcheck.permissions ?? {};
  const contents = job.contents ?? top.contents;
  assert.equal(
    contents,
    "read",
    "contents permission must be 'read' for the shellcheck job",
  );
});

test("shellcheck workflow runs on ubuntu-latest", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.equal(wf.jobs.shellcheck["runs-on"], "ubuntu-latest");
});
