// Regression tests for the Deno Dependency Audit workflow (issue #82).
//
// SCR-VULN-SCAN: the repository previously ran SAST, secret scanning and
// a diff-scoped dependency-review-action, but nothing audited the full
// Deno dependency tree for known advisories. This workflow wires up
// `deno audit` (OSV advisory cross-reference of deno.lock) on both pull
// requests and a weekly schedule so a freshly-disclosed CVE in an
// existing, unchanged dependency is still caught.
//
// Australian English: behaviour, organisation. These tests parse the
// workflow YAML into a JavaScript object and assert on its structured
// fields so a reformat cannot break the gate while a real regression
// (an unpinned action, a missing `deno audit` step, a dropped trigger)
// still trips them.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadWorkflow, workflowPath } from "./_workflow-yaml.js";

const WORKFLOW = "deno-audit.yml";
const SHA_RE = /^[0-9a-f]{40}$/;

test("deno-audit workflow file exists", () => {
  assert.ok(
    fs.existsSync(workflowPath(WORKFLOW)),
    `Expected workflow at ${workflowPath(WORKFLOW)}`,
  );
});

test("workflow declares the expected name", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.equal(wf.name, "Deno Dependency Audit");
});

test("workflow runs on pull_request, a weekly schedule and manual dispatch", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.ok(wf.on, "workflow must declare an `on:` block");

  // PR trigger: catch a vulnerable dependency added in a diff.
  assert.ok(
    "pull_request" in wf.on,
    "workflow must run on pull_request so new advisories are caught in CI",
  );

  // Schedule: catch a freshly-disclosed CVE in an existing, unchanged
  // dependency without waiting for a PR — the core posture gap.
  assert.ok(
    "schedule" in wf.on,
    "workflow must run on a cron schedule",
  );
  assert.ok(
    Array.isArray(wf.on.schedule) && wf.on.schedule.length > 0,
    "schedule must be a non-empty list",
  );
  const cron = wf.on.schedule[0].cron;
  // Weekly cadence: a five-field cron whose day-of-week field is a
  // single weekday (not the `*` wildcard).
  assert.ok(typeof cron === "string", "schedule entry must declare a cron");
  const fields = cron.trim().split(/\s+/);
  assert.equal(fields.length, 5, `cron must have five fields (saw '${cron}')`);
  assert.notEqual(
    fields[4],
    "*",
    `cron must pin a weekday for a weekly cadence (saw '${cron}')`,
  );

  // Manual dispatch so a maintainer can run the audit on demand.
  assert.ok(
    "workflow_dispatch" in wf.on,
    "workflow must also be manually dispatchable",
  );
});

test("workflow uses pinned commit SHAs for every third-party action", () => {
  const wf = loadWorkflow(WORKFLOW);
  const steps = wf.jobs.audit.steps;
  const required = ["actions/checkout", "denoland/setup-deno"];
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
  const step = wf.jobs.audit.steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("denoland/setup-deno@"),
  );
  assert.ok(step.with, "setup-deno step must declare a `with:` block");
  assert.equal(step.with["deno-version"], "v2.x");
});

test("workflow runs `deno audit` over the dependency tree", () => {
  const wf = loadWorkflow(WORKFLOW);
  const runs = wf.jobs.audit.steps
    .map((s) => s.run)
    .filter((r) => typeof r === "string");
  assert.ok(
    runs.some((r) => /\bdeno audit\b/.test(r)),
    "expected a `deno audit` step",
  );
});

test("workflow grants read-only contents and no write scopes", () => {
  const wf = loadWorkflow(WORKFLOW);
  // The audit only reads deno.lock; it needs no write permissions.
  const top = wf.permissions ?? {};
  const job = wf.jobs.audit.permissions ?? {};
  const contents = job.contents ?? top.contents;
  assert.equal(
    contents,
    "read",
    "the audit only reads the dependency tree, so contents must be read",
  );
  for (const scope of Object.values({ ...top, ...job })) {
    assert.notEqual(
      scope,
      "write",
      "the audit workflow must not request any write scope",
    );
  }
});

test("workflow runs on ubuntu-latest with a bounded timeout", () => {
  const wf = loadWorkflow(WORKFLOW);
  const job = wf.jobs.audit;
  assert.equal(job["runs-on"], "ubuntu-latest");
  assert.ok(
    typeof job["timeout-minutes"] === "number" &&
      job["timeout-minutes"] > 0 &&
      job["timeout-minutes"] <= 30,
    `timeout-minutes must be a small positive number (saw ${job["timeout-minutes"]})`,
  );
});

test("workflow cancels superseded runs via a concurrency group", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.ok(wf.concurrency, "workflow must declare a concurrency block");
  assert.ok(
    typeof wf.concurrency.group === "string" &&
      wf.concurrency.group.length > 0,
    "concurrency must define a group",
  );
  assert.equal(wf.concurrency["cancel-in-progress"], true);
});
