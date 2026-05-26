// Regression tests for the Dependency Review workflow (issue #14).
//
// Australian English: these tests verify that third-party actions
// referenced from dependency-review.yml are pinned to 40-character
// commit SHAs so a hijacked tag cannot influence the supply-chain
// review running on every PR.
//
// Issue #42: assertions previously regex-matched the raw YAML text;
// they now parse the workflow into a JavaScript object and assert on
// its structured fields.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  collectActionRefs,
  loadWorkflow,
  workflowPath,
} from "./_workflow-yaml.js";

const WORKFLOW = "dependency-review.yml";
const SHA_RE = /^[0-9a-f]{40}$/;

test("dependency-review workflow file exists", () => {
  assert.ok(
    fs.existsSync(workflowPath(WORKFLOW)),
    `Expected workflow at ${workflowPath(WORKFLOW)}`,
  );
});

test("dependency-review workflow declares the expected name and trigger", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.equal(wf.name, "Dependency Review");
  assert.ok(
    wf.on && "pull_request" in wf.on,
    "workflow must run on pull_request events",
  );
});

test("dependency-review workflow uses pinned commit SHA for actions/checkout", () => {
  const wf = loadWorkflow(WORKFLOW);
  const step = wf.jobs["dependency-review"].steps.find(
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

test("dependency-review workflow uses pinned commit SHA for actions/dependency-review-action", () => {
  const wf = loadWorkflow(WORKFLOW);
  const step = wf.jobs["dependency-review"].steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("actions/dependency-review-action@"),
  );
  assert.ok(step, "expected an actions/dependency-review-action step");
  const ref = step.uses.split("@")[1];
  assert.match(
    ref,
    SHA_RE,
    `actions/dependency-review-action must be pinned to a 40-character commit SHA (saw '${ref}')`,
  );
});

test("dependency-review workflow has no third-party action pinned by floating tag", () => {
  const wf = loadWorkflow(WORKFLOW);
  const refs = collectActionRefs(wf);
  const floating = refs.filter(({ ref }) => !SHA_RE.test(ref));
  assert.deepEqual(
    floating,
    [],
    "third-party actions must be pinned to commit SHAs, not floating tags",
  );
});

test("dependency-review workflow uses least-privilege permissions", () => {
  const wf = loadWorkflow(WORKFLOW);
  const top = wf.permissions ?? {};
  const job = wf.jobs["dependency-review"].permissions ?? {};
  const contents = job.contents ?? top.contents;
  assert.equal(
    contents,
    "read",
    "contents permission must be 'read' for the dependency-review job",
  );
});
