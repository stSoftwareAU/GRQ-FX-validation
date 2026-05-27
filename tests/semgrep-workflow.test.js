// Regression tests for the Semgrep SAST Scanning workflow (issue #2).
//
// Australian English: these tests verify the Semgrep workflow file is
// present and well-formed so the SAST CI gate cannot regress silently.
//
// Issue #42: assertions previously regex-matched the raw YAML text;
// they now parse the workflow into a JavaScript object and assert on
// its structured fields.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadWorkflow, workflowPath } from "./_workflow-yaml.js";

const WORKFLOW = "semgrep.yml";
const SHA_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /@sha256:[0-9a-f]{64}\b/;

test("semgrep workflow file exists", () => {
  assert.ok(
    fs.existsSync(workflowPath(WORKFLOW)),
    `Expected workflow at ${workflowPath(WORKFLOW)}`,
  );
});

test("semgrep workflow declares the expected name and triggers", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.equal(wf.name, "Semgrep");
  assert.ok(
    wf.on && "pull_request" in wf.on,
    "workflow must run on pull_request events",
  );
});

test("semgrep workflow uses pinned commit SHA for actions/checkout", () => {
  const wf = loadWorkflow(WORKFLOW);
  const step = wf.jobs.semgrep.steps.find(
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

test("semgrep workflow runs semgrep ci inside the semgrep container", () => {
  const wf = loadWorkflow(WORKFLOW);
  const job = wf.jobs.semgrep;
  assert.ok(job.container, "semgrep job must declare a `container:` block");
  assert.ok(
    typeof job.container.image === "string" &&
      job.container.image.startsWith("semgrep/semgrep"),
    `container image must be from semgrep/semgrep, saw '${job.container.image}'`,
  );
  // The actual scan must be a step that runs `semgrep ci --config p/default`.
  const runStep = job.steps.find(
    (s) => typeof s.run === "string" && /\bsemgrep ci\b/.test(s.run),
  );
  assert.ok(runStep, "expected a step that runs `semgrep ci`");
  assert.match(
    runStep.run,
    /--config\s+p\/default/,
    "semgrep ci must pull the p/default ruleset",
  );
});

test("semgrep container image is pinned to a sha256 digest (issue #16)", () => {
  // Supply-chain hardening: the container image must be pinned to an
  // immutable sha256 digest so a hijacked semgrep/semgrep:latest tag
  // cannot exfiltrate SEMGREP_APP_TOKEN or tamper with SAST results.
  const wf = loadWorkflow(WORKFLOW);
  const image = wf.jobs.semgrep.container?.image ?? "";
  assert.match(
    image,
    SHA256_RE,
    `semgrep container image must include @sha256:<digest>, saw '${image}'`,
  );
  assert.notEqual(
    image,
    "semgrep/semgrep",
    "semgrep container image must not be the implicit :latest reference",
  );
});

test("semgrep workflow uses least-privilege permissions", () => {
  const wf = loadWorkflow(WORKFLOW);
  const top = wf.permissions ?? {};
  const job = wf.jobs.semgrep.permissions ?? {};
  const contents = job.contents ?? top.contents;
  assert.equal(
    contents,
    "read",
    "contents permission must be 'read' for the semgrep job",
  );
});

test("semgrep workflow wires the SEMGREP_APP_TOKEN secret via env", () => {
  const wf = loadWorkflow(WORKFLOW);
  const step = wf.jobs.semgrep.steps.find(
    (s) => typeof s.run === "string" && /\bsemgrep ci\b/.test(s.run),
  );
  assert.ok(step, "expected the semgrep ci step");
  assert.ok(step.env, "semgrep ci step must declare an env block");
  assert.equal(
    step.env.SEMGREP_APP_TOKEN,
    "${{ secrets.SEMGREP_APP_TOKEN }}",
  );
});
