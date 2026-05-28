// Regression tests for the Deno Quality workflow (issue #62).
//
// Australian English: behaviour, organisation. These tests parse the
// workflow YAML into a JavaScript object and assert on its structured
// fields so a reformat cannot break the gate while a real regression
// (a missing `deno lint` step, an unpinned action) still trips them.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadWorkflow, workflowPath } from "./_workflow-yaml.js";

const WORKFLOW = "deno-quality.yml";
const SHA_RE = /^[0-9a-f]{40}$/;
const DENO_JSON = path.join(path.resolve(process.cwd()), "deno.json");

test("deno-quality workflow file exists", () => {
  assert.ok(
    fs.existsSync(workflowPath(WORKFLOW)),
    `Expected workflow at ${workflowPath(WORKFLOW)}`,
  );
});

test("workflow declares the expected name and PR trigger", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.equal(wf.name, "Deno Quality");
  assert.ok(
    wf.on && "pull_request" in wf.on,
    "workflow must run on pull_request events",
  );
});

test("workflow uses pinned commit SHAs for every third-party action", () => {
  const wf = loadWorkflow(WORKFLOW);
  const steps = wf.jobs.quality.steps;
  const required = [
    "actions/checkout",
    "denoland/setup-deno",
    "codecov/codecov-action",
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
  const step = wf.jobs.quality.steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("denoland/setup-deno@"),
  );
  assert.ok(step.with, "setup-deno step must declare a `with:` block");
  assert.equal(step.with["deno-version"], "v2.x");
});

test("workflow runs deno lint, deno fmt --check and deno check", () => {
  const wf = loadWorkflow(WORKFLOW);
  const runs = wf.jobs.quality.steps
    .map((s) => s.run)
    .filter((r) => typeof r === "string");
  const has = (re) => runs.some((r) => re.test(r));
  assert.ok(has(/^\s*deno lint\b/m), "expected a `deno lint` step");
  assert.ok(
    has(/\bdeno fmt --check\b/),
    "expected a `deno fmt --check` step",
  );
  assert.ok(has(/\bdeno check\b/), "expected a `deno check` step");
});

test("workflow runs deno test with coverage and uploads to Codecov", () => {
  const wf = loadWorkflow(WORKFLOW);
  const steps = wf.jobs.quality.steps;
  const runs = steps.map((s) => s.run).filter((r) => typeof r === "string");
  assert.ok(
    runs.some((r) => /deno test\b[\s\S]*--coverage=/.test(r)),
    "expected a `deno test --coverage=…` step",
  );
  assert.ok(
    runs.some((r) => /deno coverage\b[\s\S]*--lcov/.test(r)),
    "expected a `deno coverage … --lcov` step",
  );
  const codecov = steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("codecov/codecov-action@"),
  );
  assert.ok(codecov, "expected the codecov-action upload step");
  assert.equal(codecov.with.files, "coverage.lcov");
  assert.equal(codecov.with.fail_ci_if_error, false);
});

test("workflow uses least-privilege permissions", () => {
  const wf = loadWorkflow(WORKFLOW);
  const top = wf.permissions ?? {};
  const job = wf.jobs.quality.permissions ?? {};
  const contents = job.contents ?? top.contents;
  assert.equal(
    contents,
    "read",
    "contents permission must be 'read' for the deno-quality job",
  );
});

test("workflow runs on ubuntu-latest with a bounded timeout", () => {
  const wf = loadWorkflow(WORKFLOW);
  const job = wf.jobs.quality;
  assert.equal(job["runs-on"], "ubuntu-latest");
  assert.ok(
    typeof job["timeout-minutes"] === "number" &&
      job["timeout-minutes"] > 0 &&
      job["timeout-minutes"] <= 30,
    `timeout-minutes must be a small positive number (saw ${job["timeout-minutes"]})`,
  );
});

test("workflow declares a concurrency group that cancels superseded runs", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.ok(wf.concurrency, "workflow must declare a concurrency block");
  assert.equal(wf.concurrency["cancel-in-progress"], true);
});

test("deno.json scopes lint and fmt to Deno-only paths", () => {
  assert.ok(fs.existsSync(DENO_JSON), `Expected deno.json at ${DENO_JSON}`);
  const cfg = JSON.parse(fs.readFileSync(DENO_JSON, "utf8"));
  assert.ok(cfg.lint, "deno.json must declare a `lint` block");
  assert.ok(
    Array.isArray(cfg.lint.include) && cfg.lint.include.length > 0,
    "deno.json lint.include must list the Deno source directories",
  );
  assert.ok(
    cfg.lint.include.some((p) => p.startsWith("helpers")),
    "deno.json lint.include must cover helpers/",
  );
  assert.ok(
    cfg.lint.include.some((p) => p.startsWith("tests")),
    "deno.json lint.include must cover tests/",
  );
  assert.ok(cfg.fmt, "deno.json must declare a `fmt` block");
  assert.ok(
    Array.isArray(cfg.fmt.include) && cfg.fmt.include.length > 0,
    "deno.json fmt.include must list the Deno source directories",
  );
});
