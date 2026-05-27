// Regression tests for the Markdown Lint workflow (issue #4).
//
// Australian English: these tests verify the workflow file and the
// markdownlint-cli2 configuration are present and well-formed so the
// CI gate cannot regress silently.
//
// Issue #42: assertions previously regex-matched the raw YAML text;
// they now parse the workflow into a JavaScript object and assert on
// its structured fields.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadWorkflow, workflowPath } from "./_workflow-yaml.js";

const WORKFLOW = "markdown-lint.yml";
const SHA_RE = /^[0-9a-f]{40}$/;
const CONFIG_PATH = path.join(
  path.resolve(process.cwd()),
  ".markdownlint-cli2.jsonc",
);

test("markdown-lint workflow file exists", () => {
  assert.ok(
    fs.existsSync(workflowPath(WORKFLOW)),
    `Expected workflow at ${workflowPath(WORKFLOW)}`,
  );
});

test("workflow declares the expected name and triggers", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.equal(wf.name, "Markdown Lint");
  assert.ok(wf.on, "workflow must declare an `on:` block");
  assert.ok(
    "pull_request" in wf.on,
    "workflow must run on pull_request events",
  );
  assert.ok("push" in wf.on, "workflow must run on push events");
});

test("workflow uses pinned commit SHAs for third-party actions", () => {
  const wf = loadWorkflow(WORKFLOW);
  const steps = wf.jobs.markdownlint.steps;
  const required = [
    "actions/checkout",
    "actions/setup-node",
    "denoland/setup-deno",
  ];
  for (const action of required) {
    const step = steps.find(
      (s) =>
        typeof s.uses === "string" && s.uses.startsWith(`${action}@`),
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

test("workflow installs and runs markdownlint-cli2", () => {
  const wf = loadWorkflow(WORKFLOW);
  const steps = wf.jobs.markdownlint.steps;
  const install = steps.find(
    (s) => typeof s.run === "string" &&
      /npm install -g markdownlint-cli2/.test(s.run),
  );
  assert.ok(install, "expected a step that installs markdownlint-cli2");
  const run = steps.find(
    (s) => typeof s.run === "string" &&
      /^\s*markdownlint-cli2\b/.test(s.run),
  );
  assert.ok(run, "expected a step that runs markdownlint-cli2");
});

test("workflow uses least-privilege permissions", () => {
  const wf = loadWorkflow(WORKFLOW);
  const top = wf.permissions ?? {};
  const job = wf.jobs.markdownlint.permissions ?? {};
  const contents = job.contents ?? top.contents;
  assert.equal(
    contents,
    "read",
    "contents permission must be 'read' for the markdownlint job",
  );
});

test("markdownlint-cli2 config is present and parses as JSONC", () => {
  assert.ok(
    fs.existsSync(CONFIG_PATH),
    `Expected markdownlint config at ${CONFIG_PATH}`,
  );
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  // Strip JSONC line comments before parsing.
  const stripped = raw.replace(/^\s*\/\/.*$/gm, "");
  const parsed = JSON.parse(stripped);
  assert.equal(typeof parsed, "object");
  assert.ok(Array.isArray(parsed.globs), "globs must be an array");
  assert.ok(parsed.config, "config block must be present");
});
