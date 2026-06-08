// Regression tests for the Accessibility (pa11y) workflow (issue #78).
//
// The dashboard is a public-facing PWA but no automated accessibility
// gate ran in CI, so a11y regressions were invisible to the test suite.
// This workflow runs pa11y-ci against the static site to catch WCAG 2.1
// AA violations before they reach the live Pages deploy. These tests
// parse the workflow into a JavaScript object (per issue #42) and assert
// on its structured behaviour rather than the raw YAML text, so a
// maintainer reformatting the file does not break the suite.
//
// Australian English: behaviour, colour, organisation.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadWorkflow, workflowPath } from "./_workflow-yaml.js";

const WORKFLOW = "accessibility.yml";
const SHA_RE = /^[0-9a-f]{40}$/;
const CONFIG_PATH = path.join(path.resolve(process.cwd()), "pa11yci.json");

function steps() {
  return loadWorkflow(WORKFLOW).jobs.accessibility.steps;
}

test("accessibility workflow file exists", () => {
  assert.ok(
    fs.existsSync(workflowPath(WORKFLOW)),
    `Expected workflow at ${workflowPath(WORKFLOW)}`,
  );
});

test("workflow declares the expected name and triggers", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.equal(wf.name, "Accessibility");
  assert.ok(wf.on, "workflow must declare an `on:` block");
  assert.ok("pull_request" in wf.on, "workflow must run on pull_request events");
  assert.ok("push" in wf.on, "workflow must run on push events");
});

test("workflow uses pinned commit SHAs for third-party actions", () => {
  const required = ["actions/checkout", "actions/setup-node"];
  for (const action of required) {
    const step = steps().find(
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

test("workflow installs a pinned pa11y-ci and runs it", () => {
  const install = steps().find(
    (s) => typeof s.run === "string" && /npm install -g pa11y-ci@/.test(s.run),
  );
  assert.ok(install, "expected a step that installs a pinned pa11y-ci");
  assert.match(
    install.run,
    /pa11y-ci@\d+\.\d+\.\d+/,
    "pa11y-ci must be pinned to an explicit version",
  );
  const run = steps().find(
    (s) => typeof s.run === "string" && /\bpa11y-ci --config pa11yci\.json\b/.test(s.run),
  );
  assert.ok(run, "expected a step that runs pa11y-ci against pa11yci.json");
});

test("workflow declares a tight job timeout", () => {
  const job = loadWorkflow(WORKFLOW).jobs.accessibility;
  assert.ok(
    typeof job["timeout-minutes"] === "number" &&
      job["timeout-minutes"] >= 1 && job["timeout-minutes"] <= 60,
    `accessibility job must declare a timeout-minutes in [1, 60], saw ${job["timeout-minutes"]}`,
  );
});

test("workflow cancels superseded runs via a concurrency block", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.ok(wf.concurrency, "workflow must declare a top-level concurrency block");
  assert.equal(wf.concurrency["cancel-in-progress"], true);
});

test("workflow uses least-privilege permissions", () => {
  const wf = loadWorkflow(WORKFLOW);
  const top = wf.permissions ?? {};
  const job = wf.jobs.accessibility.permissions ?? {};
  const contents = job.contents ?? top.contents;
  assert.equal(
    contents,
    "read",
    "contents permission must be 'read' for the accessibility job",
  );
});

test("pa11yci config is present and enforces WCAG2AA on the PWA entry point", () => {
  assert.ok(fs.existsSync(CONFIG_PATH), `Expected pa11y config at ${CONFIG_PATH}`);
  const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  assert.equal(parsed.defaults?.standard, "WCAG2AA", "must enforce WCAG 2.1 AA");
  assert.ok(Array.isArray(parsed.urls) && parsed.urls.length > 0, "urls must be a non-empty array");
  assert.ok(
    parsed.urls.some((u) => /index\.html$/.test(u)),
    "urls must include the PWA entry point index.html",
  );
  // Chromium must run with --no-sandbox so headless Chrome launches as
  // root on the CI runner.
  const args = parsed.defaults?.chromeLaunchConfig?.args ?? [];
  assert.ok(
    args.includes("--no-sandbox"),
    "chromeLaunchConfig must pass --no-sandbox for the CI runner",
  );
});
