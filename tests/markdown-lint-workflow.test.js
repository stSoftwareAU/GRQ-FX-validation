// Regression tests for the Markdown Lint workflow (issue #4).
// Australian English: these tests verify the workflow file and the
// markdownlint-cli2 configuration are present and well-formed so the
// CI gate cannot regress silently.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const WORKFLOW_PATH = path.join(
  REPO_ROOT,
  ".github",
  "workflows",
  "markdown-lint.yml",
);
const CONFIG_PATH = path.join(REPO_ROOT, ".markdownlint-cli2.jsonc");

function readWorkflow() {
  return fs.readFileSync(WORKFLOW_PATH, "utf8");
}

test("markdown-lint workflow file exists", () => {
  assert.ok(
    fs.existsSync(WORKFLOW_PATH),
    `Expected workflow at ${WORKFLOW_PATH}`,
  );
});

test("workflow declares the expected name and triggers", () => {
  const yaml = readWorkflow();
  assert.match(yaml, /^name:\s*Markdown Lint\s*$/m);
  assert.match(yaml, /pull_request:/);
  assert.match(yaml, /push:/);
});

test("workflow uses pinned commit SHAs for third-party actions", () => {
  const yaml = readWorkflow();
  // actions/checkout pinned to a 40-character commit SHA
  assert.match(
    yaml,
    /uses:\s*actions\/checkout@[0-9a-f]{40}/,
    "actions/checkout must be pinned to a 40-character commit SHA",
  );
  assert.match(
    yaml,
    /uses:\s*actions\/setup-node@[0-9a-f]{40}/,
    "actions/setup-node must be pinned to a 40-character commit SHA",
  );
  assert.match(
    yaml,
    /uses:\s*denoland\/setup-deno@[0-9a-f]{40}/,
    "denoland/setup-deno must be pinned to a 40-character commit SHA",
  );
});

test("workflow installs and runs markdownlint-cli2", () => {
  const yaml = readWorkflow();
  assert.match(yaml, /npm install -g markdownlint-cli2/);
  assert.match(yaml, /run:\s*markdownlint-cli2/);
});

test("workflow uses least-privilege permissions", () => {
  const yaml = readWorkflow();
  assert.match(yaml, /permissions:\s*\n\s*contents:\s*read/);
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
