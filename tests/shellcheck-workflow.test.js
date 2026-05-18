// Regression tests for the ShellCheck Lint workflow (issue #5).
// Australian English: these tests verify the ShellCheck workflow file is
// present and well-formed so the shell-script quality gate cannot regress
// silently.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const WORKFLOW_PATH = path.join(
  REPO_ROOT,
  ".github",
  "workflows",
  "shellcheck.yml",
);

function readWorkflow() {
  return fs.readFileSync(WORKFLOW_PATH, "utf8");
}

test("shellcheck workflow file exists", () => {
  assert.ok(
    fs.existsSync(WORKFLOW_PATH),
    `Expected workflow at ${WORKFLOW_PATH}`,
  );
});

test("shellcheck workflow declares the expected name and PR trigger", () => {
  const yaml = readWorkflow();
  assert.match(yaml, /^name:\s*ShellCheck\s*$/m);
  assert.match(yaml, /pull_request:/);
});

test("shellcheck workflow uses pinned commit SHA for actions/checkout", () => {
  const yaml = readWorkflow();
  assert.match(
    yaml,
    /uses:\s*actions\/checkout@[0-9a-f]{40}/,
    "actions/checkout must be pinned to a 40-character commit SHA",
  );
});

test("shellcheck workflow uses pinned commit SHA for ludeeus/action-shellcheck", () => {
  const yaml = readWorkflow();
  assert.match(
    yaml,
    /uses:\s*ludeeus\/action-shellcheck@[0-9a-f]{40}/,
    "ludeeus/action-shellcheck must be pinned to a 40-character commit SHA, not @master",
  );
  assert.doesNotMatch(
    yaml,
    /ludeeus\/action-shellcheck@master/,
    "must not reference the floating @master ref",
  );
});

test("shellcheck workflow configures scandir and warning severity", () => {
  const yaml = readWorkflow();
  assert.match(yaml, /scandir:\s*\./);
  assert.match(yaml, /severity:\s*warning/);
});

test("shellcheck workflow uses least-privilege permissions", () => {
  const yaml = readWorkflow();
  assert.match(yaml, /permissions:\s*\n\s*contents:\s*read/);
});

test("shellcheck workflow runs on ubuntu-latest", () => {
  const yaml = readWorkflow();
  assert.match(yaml, /runs-on:\s*ubuntu-latest/);
});
