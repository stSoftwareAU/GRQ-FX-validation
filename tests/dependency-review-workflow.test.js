// Regression tests for the Dependency Review workflow (issue #14).
// Australian English: these tests verify that third-party actions
// referenced from dependency-review.yml are pinned to 40-character
// commit SHAs so a hijacked tag cannot influence the supply-chain
// review running on every PR. Mirrors the pattern from
// tests/gitleaks-workflow.test.js (Issue #1756).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const WORKFLOW_PATH = path.join(
  REPO_ROOT,
  ".github",
  "workflows",
  "dependency-review.yml",
);

function readWorkflow() {
  return fs.readFileSync(WORKFLOW_PATH, "utf8");
}

test("dependency-review workflow file exists", () => {
  assert.ok(
    fs.existsSync(WORKFLOW_PATH),
    `Expected workflow at ${WORKFLOW_PATH}`,
  );
});

test("dependency-review workflow declares the expected name and trigger", () => {
  const yaml = readWorkflow();
  assert.match(yaml, /^name:\s*Dependency Review\s*$/m);
  assert.match(yaml, /pull_request:/);
});

test("dependency-review workflow uses pinned commit SHA for actions/checkout", () => {
  const yaml = readWorkflow();
  assert.match(
    yaml,
    /uses:\s*actions\/checkout@[0-9a-f]{40}/,
    "actions/checkout must be pinned to a 40-character commit SHA",
  );
});

test("dependency-review workflow uses pinned commit SHA for actions/dependency-review-action", () => {
  const yaml = readWorkflow();
  assert.match(
    yaml,
    /uses:\s*actions\/dependency-review-action@[0-9a-f]{40}/,
    "actions/dependency-review-action must be pinned to a 40-character commit SHA",
  );
});

test("dependency-review workflow has no third-party action pinned by floating tag", () => {
  const yaml = readWorkflow();
  const stripped = yaml
    .split("\n")
    .map((line) => line.replace(/#.*$/, ""))
    .join("\n");
  const allRefs = [...stripped.matchAll(/uses:\s*([^\s#]+)@(\S+)/g)];
  const floating = allRefs
    .map(([, action, ref]) => ({ action, ref }))
    .filter(({ ref }) => !/^[0-9a-f]{40}$/.test(ref));
  assert.deepEqual(
    floating,
    [],
    "third-party actions must be pinned to commit SHAs, not floating tags",
  );
});

test("dependency-review workflow uses least-privilege permissions", () => {
  const yaml = readWorkflow();
  assert.match(yaml, /permissions:\s*\n\s*contents:\s*read/);
});
