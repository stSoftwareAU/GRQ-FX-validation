// Regression tests for the Gitleaks Secrets Detection workflow (issue #1).
// Australian English: these tests verify the Gitleaks workflow file is present
// and well-formed so the secrets-detection CI gate cannot regress silently.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const WORKFLOW_PATH = path.join(
  REPO_ROOT,
  ".github",
  "workflows",
  "gitleaks.yml",
);

function readWorkflow() {
  return fs.readFileSync(WORKFLOW_PATH, "utf8");
}

test("gitleaks workflow file exists", () => {
  assert.ok(
    fs.existsSync(WORKFLOW_PATH),
    `Expected workflow at ${WORKFLOW_PATH}`,
  );
});

test("gitleaks workflow declares the expected name and triggers", () => {
  const yaml = readWorkflow();
  assert.match(yaml, /^name:\s*Gitleaks\s*$/m);
  assert.match(yaml, /pull_request:/);
});

test("gitleaks workflow uses pinned commit SHA for actions/checkout", () => {
  const yaml = readWorkflow();
  assert.match(
    yaml,
    /uses:\s*actions\/checkout@[0-9a-f]{40}/,
    "actions/checkout must be pinned to a 40-character commit SHA",
  );
});

test("gitleaks workflow checks out the full history (fetch-depth: 0)", () => {
  const yaml = readWorkflow();
  assert.match(
    yaml,
    /fetch-depth:\s*0/,
    "fetch-depth: 0 is required so gitleaks can see the PR commit range",
  );
});

test("gitleaks workflow fetches the PR base branch before scanning", () => {
  const yaml = readWorkflow();
  assert.match(
    yaml,
    /git fetch origin "\$\{\{\s*github\.base_ref\s*\}\}:\$\{\{\s*github\.base_ref\s*\}\}"/,
    "Must fetch the PR base ref so the commit range resolves on the runner",
  );
});

test("gitleaks workflow uses pinned commit SHA for gitleaks-action", () => {
  const yaml = readWorkflow();
  assert.match(
    yaml,
    /uses:\s*gitleaks\/gitleaks-action@[0-9a-f]{40}/,
    "gitleaks-action must be pinned to a 40-character commit SHA (Issue #1756)",
  );
});

test("gitleaks workflow uses least-privilege permissions", () => {
  const yaml = readWorkflow();
  assert.match(yaml, /permissions:\s*\n\s*contents:\s*read/);
});

test("gitleaks workflow wires GITHUB_TOKEN and GITLEAKS_LICENSE via env", () => {
  const yaml = readWorkflow();
  assert.match(
    yaml,
    /GITHUB_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/,
  );
  assert.match(
    yaml,
    /GITLEAKS_LICENSE:\s*\$\{\{\s*secrets\.GITLEAKS_LICENSE\s*\}\}/,
  );
});
