// Regression tests for the Deno Dependency Updates workflow (issue #61).
//
// Australian English: behaviour, organisation. These tests parse the
// workflow YAML into a JavaScript object and assert on its structured
// fields so a reformat cannot break the gate while a real regression
// (an unpinned action, a missing `deno outdated` step, a wrong cron)
// still trips them.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadWorkflow, workflowPath } from "./_workflow-yaml.js";

const WORKFLOW = "deno-outdated.yml";
const SHA_RE = /^[0-9a-f]{40}$/;

test("deno-outdated workflow file exists", () => {
  assert.ok(
    fs.existsSync(workflowPath(WORKFLOW)),
    `Expected workflow at ${workflowPath(WORKFLOW)}`,
  );
});

test("workflow declares the expected name and triggers", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.equal(wf.name, "Deno Dependency Updates");
  assert.ok(wf.on, "workflow must declare an `on:` block");
  assert.ok(
    "schedule" in wf.on,
    "workflow must run on a cron schedule",
  );
  assert.ok(
    "workflow_dispatch" in wf.on,
    "workflow must also be manually dispatchable",
  );
  // schedule is a list of { cron: "..." } entries.
  assert.ok(
    Array.isArray(wf.on.schedule) && wf.on.schedule.length > 0,
    "schedule must be a non-empty list",
  );
  const cron = wf.on.schedule[0].cron;
  assert.equal(
    cron,
    "0 6 * * 1",
    `expected weekly Monday 06:00 cron, saw '${cron}'`,
  );
});

test("workflow uses pinned commit SHAs for every third-party action", () => {
  const wf = loadWorkflow(WORKFLOW);
  const steps = wf.jobs.outdated.steps;
  const required = [
    "actions/checkout",
    "denoland/setup-deno",
    "peter-evans/create-pull-request",
  ];
  for (const action of required) {
    const step = steps.find(
      (s) => typeof s.uses === "string" && s.uses.startsWith(`${action}@`),
    );
    assert.ok(step, `expected a step that uses ${action}`);
    const ref = step.uses.split("@")[1];
    assert.match(
      ref,
      SHA_RE,
      `${action} must be pinned to a 40-character commit SHA (saw '${ref}')`,
    );
  }
});

test("workflow pins denoland/setup-deno to v2.x", () => {
  const wf = loadWorkflow(WORKFLOW);
  const step = wf.jobs.outdated.steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("denoland/setup-deno@"),
  );
  assert.ok(step.with, "setup-deno step must declare a `with:` block");
  assert.equal(step.with["deno-version"], "v2.x");
});

test("workflow runs `deno outdated --update --latest`", () => {
  const wf = loadWorkflow(WORKFLOW);
  const runs = wf.jobs.outdated.steps
    .map((s) => s.run)
    .filter((r) => typeof r === "string");
  assert.ok(
    runs.some((r) => /\bdeno outdated\b/.test(r) &&
      /--update\b/.test(r) && /--latest\b/.test(r)),
    "expected a `deno outdated --update --latest` step",
  );
});

test("create-pull-request step falls back from ACTIONS_PUSH to GITHUB_TOKEN", () => {
  const wf = loadWorkflow(WORKFLOW);
  const step = wf.jobs.outdated.steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("peter-evans/create-pull-request@"),
  );
  assert.ok(step.with, "create-pull-request step must declare a `with:` block");
  // The token must reference both ACTIONS_PUSH (Issue #1636 PAT) and the
  // GITHUB_TOKEN fallback so the workflow keeps functioning when the
  // org-level PAT secret is unset.
  const token = step.with.token;
  assert.ok(
    typeof token === "string" &&
      /ACTIONS_PUSH/.test(token) &&
      /GITHUB_TOKEN/.test(token),
    `token must fall back from ACTIONS_PUSH to GITHUB_TOKEN (saw '${token}')`,
  );
  assert.equal(step.with.branch, "chore/deno-outdated");
  assert.ok(
    typeof step.with["commit-message"] === "string" &&
      step.with["commit-message"].length > 0,
    "create-pull-request must set a commit-message",
  );
  assert.ok(
    typeof step.with.title === "string" && step.with.title.length > 0,
    "create-pull-request must set a PR title",
  );
});

test("workflow grants contents: write and pull-requests: write", () => {
  const wf = loadWorkflow(WORKFLOW);
  // Permissions may be declared at the workflow or job level.
  const top = wf.permissions ?? {};
  const job = wf.jobs.outdated.permissions ?? {};
  const contents = job.contents ?? top.contents;
  const pulls = job["pull-requests"] ?? top["pull-requests"];
  assert.equal(
    contents,
    "write",
    "create-pull-request requires contents: write to push the branch",
  );
  assert.equal(
    pulls,
    "write",
    "create-pull-request requires pull-requests: write to open the PR",
  );
});

test("workflow runs on ubuntu-latest with a bounded timeout", () => {
  const wf = loadWorkflow(WORKFLOW);
  const job = wf.jobs.outdated;
  assert.equal(job["runs-on"], "ubuntu-latest");
  assert.ok(
    typeof job["timeout-minutes"] === "number" &&
      job["timeout-minutes"] > 0 &&
      job["timeout-minutes"] <= 30,
    `timeout-minutes must be a small positive number (saw ${job["timeout-minutes"]})`,
  );
});
