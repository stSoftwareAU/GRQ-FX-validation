// Regression tests for the SBOM workflow (issue #111, SCR-SBOM).
//
// The dashboard is a continuously-deployed PWA, but nothing produced a
// Software Bill of Materials describing what is shipped to the live
// GitHub Pages instance. sbom.yml regenerates a CycloneDX SBOM from the
// locked Deno tree and the CDN libraries in docs/, then uploads it as a
// build artefact. These tests parse the workflow YAML into a JavaScript
// object and assert on its structured fields so a reformat cannot break
// the gate while a real regression (an unpinned action, a missing
// generate or upload step, a dropped trigger) still trips them.
//
// Australian English: behaviour, organisation, artefact.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadWorkflow, workflowPath } from "./_workflow-yaml.js";

const WORKFLOW = "sbom.yml";
const SHA_RE = /^[0-9a-f]{40}$/;

test("sbom workflow file exists", () => {
  assert.ok(
    fs.existsSync(workflowPath(WORKFLOW)),
    `Expected workflow at ${workflowPath(WORKFLOW)}`,
  );
});

test("workflow declares the expected name", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.equal(wf.name, "SBOM");
});

test("workflow runs on push, pull_request, a weekly schedule and manual dispatch", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.ok(wf.on, "workflow must declare an `on:` block");

  assert.ok("push" in wf.on, "workflow must run on push so each deploy is inventoried");
  assert.ok(
    "pull_request" in wf.on,
    "workflow must run on pull_request so the SBOM stays current",
  );

  assert.ok("schedule" in wf.on, "workflow must run on a cron schedule");
  assert.ok(
    Array.isArray(wf.on.schedule) && wf.on.schedule.length > 0,
    "schedule must be a non-empty list",
  );
  const cron = wf.on.schedule[0].cron;
  assert.ok(typeof cron === "string", "schedule entry must declare a cron");
  const fields = cron.trim().split(/\s+/);
  assert.equal(fields.length, 5, `cron must have five fields (saw '${cron}')`);
  assert.notEqual(
    fields[4],
    "*",
    `cron must pin a weekday for a weekly cadence (saw '${cron}')`,
  );

  assert.ok(
    "workflow_dispatch" in wf.on,
    "workflow must also be manually dispatchable",
  );
});

test("workflow uses pinned commit SHAs for every third-party action", () => {
  const wf = loadWorkflow(WORKFLOW);
  const steps = wf.jobs.sbom.steps;
  const required = [
    "actions/checkout",
    "denoland/setup-deno",
    "actions/upload-artifact",
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
  const step = wf.jobs.sbom.steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("denoland/setup-deno@"),
  );
  assert.ok(step.with, "setup-deno step must declare a `with:` block");
  assert.equal(step.with["deno-version"], "v2.x");
});

test("workflow generates the SBOM via the Deno generator script", () => {
  const wf = loadWorkflow(WORKFLOW);
  const runs = wf.jobs.sbom.steps
    .map((s) => s.run)
    .filter((r) => typeof r === "string");
  assert.ok(
    runs.some((r) => /scripts\/gen-sbom\.ts/.test(r) && /\bdeno run\b/.test(r)),
    "expected a step that runs scripts/gen-sbom.ts with `deno run`",
  );
});

test("workflow uploads the generated SBOM artefact", () => {
  const wf = loadWorkflow(WORKFLOW);
  const upload = wf.jobs.sbom.steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("actions/upload-artifact@"),
  );
  assert.ok(upload, "expected an actions/upload-artifact step");
  assert.ok(upload.with, "upload step must declare a `with:` block");
  assert.equal(
    upload.with.path,
    "sbom.cdx.json",
    "upload step must publish the generated sbom.cdx.json",
  );
});

test("workflow grants read-only contents and no write scopes", () => {
  const wf = loadWorkflow(WORKFLOW);
  const top = wf.permissions ?? {};
  const job = wf.jobs.sbom.permissions ?? {};
  const contents = job.contents ?? top.contents;
  assert.equal(
    contents,
    "read",
    "generating and uploading an artefact only reads the tree",
  );
  for (const scope of Object.values({ ...top, ...job })) {
    assert.notEqual(
      scope,
      "write",
      "the SBOM workflow must not request any write scope",
    );
  }
});

test("workflow runs on ubuntu-latest with a bounded timeout", () => {
  const wf = loadWorkflow(WORKFLOW);
  const job = wf.jobs.sbom;
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
