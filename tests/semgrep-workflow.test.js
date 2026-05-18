// Regression tests for the Semgrep SAST Scanning workflow (issue #2).
// Australian English: these tests verify the Semgrep workflow file is present
// and well-formed so the SAST CI gate cannot regress silently.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const WORKFLOW_PATH = path.join(
  REPO_ROOT,
  ".github",
  "workflows",
  "semgrep.yml",
);

function readWorkflow() {
  return fs.readFileSync(WORKFLOW_PATH, "utf8");
}

test("semgrep workflow file exists", () => {
  assert.ok(
    fs.existsSync(WORKFLOW_PATH),
    `Expected workflow at ${WORKFLOW_PATH}`,
  );
});

test("semgrep workflow declares the expected name and triggers", () => {
  const yaml = readWorkflow();
  assert.match(yaml, /^name:\s*Semgrep\s*$/m);
  assert.match(yaml, /pull_request:/);
});

test("semgrep workflow uses pinned commit SHA for actions/checkout", () => {
  const yaml = readWorkflow();
  assert.match(
    yaml,
    /uses:\s*actions\/checkout@[0-9a-f]{40}/,
    "actions/checkout must be pinned to a 40-character commit SHA",
  );
});

test("semgrep workflow runs semgrep ci inside the semgrep container", () => {
  const yaml = readWorkflow();
  assert.match(yaml, /image:\s*semgrep\/semgrep/);
  assert.match(yaml, /semgrep\s+ci\b/);
  assert.match(yaml, /--config\s+p\/default/);
});

test("semgrep workflow uses least-privilege permissions", () => {
  const yaml = readWorkflow();
  assert.match(yaml, /permissions:\s*\n\s*contents:\s*read/);
});

test("semgrep workflow wires the SEMGREP_APP_TOKEN secret via env", () => {
  const yaml = readWorkflow();
  assert.match(
    yaml,
    /SEMGREP_APP_TOKEN:\s*\$\{\{\s*secrets\.SEMGREP_APP_TOKEN\s*\}\}/,
  );
});
