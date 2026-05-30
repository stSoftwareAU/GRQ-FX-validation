// Structural tests for the PWA version-bump guard job in ci.yml (issue #65).
//
// These parse ci.yml into a JavaScript object (via _workflow-yaml.js) and
// assert on the job's structured fields — they survive benign reformatting
// but fail loudly if the guard job is dropped, stops running on PRs, or
// loses its full-history checkout (which the diff against the base depends
// on).
//
// Australian English: behaviour, colour, organisation.

import test from "node:test";
import assert from "node:assert/strict";
import { loadWorkflow } from "./_workflow-yaml.js";

const WORKFLOW = "ci.yml";
const JOB = "version-guard";

test("ci workflow defines the PWA version-bump guard job", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.ok(wf.jobs[JOB], `expected a '${JOB}' job in ci.yml`);
});

test("version-guard job runs only on pull_request events", () => {
  const wf = loadWorkflow(WORKFLOW);
  const job = wf.jobs[JOB];
  assert.match(
    String(job.if),
    /github\.event_name == 'pull_request'/,
    "version-guard must gate on pull_request events",
  );
});

test("version-guard checks out full history for diffing the base", () => {
  const wf = loadWorkflow(WORKFLOW);
  const checkout = wf.jobs[JOB].steps.find(
    (s) => typeof s.uses === "string" && s.uses.startsWith("actions/checkout@"),
  );
  assert.ok(checkout, "version-guard must have a checkout step");
  assert.equal(
    String(checkout.with["fetch-depth"]),
    "0",
    "checkout must use fetch-depth: 0 so the PR base ref is available",
  );
});

test("version-guard invokes the check-version-bump script with the base SHA", () => {
  const wf = loadWorkflow(WORKFLOW);
  const step = wf.jobs[JOB].steps.find(
    (s) => typeof s.run === "string" && s.run.includes("check-version-bump.ts"),
  );
  assert.ok(step, "version-guard must run scripts/check-version-bump.ts");
  assert.match(
    step.run,
    /pull_request\.base\.sha/,
    "the guard must be diffed against the PR base SHA",
  );
});
