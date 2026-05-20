// Regression tests for the CI/CD Pipeline workflow (issue #14).
// Australian English: these tests verify that third-party actions
// referenced from ci.yml are pinned to 40-character commit SHAs so a
// hijacked tag cannot exfiltrate CI secrets or publish arbitrary
// content to GitHub Pages. Mirrors the pattern from
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
  "ci.yml",
);

function readWorkflow() {
  return fs.readFileSync(WORKFLOW_PATH, "utf8");
}

test("ci workflow file exists", () => {
  assert.ok(
    fs.existsSync(WORKFLOW_PATH),
    `Expected workflow at ${WORKFLOW_PATH}`,
  );
});

test("ci workflow declares the expected name and trigger", () => {
  const yaml = readWorkflow();
  assert.match(yaml, /^name:\s*CI\/CD Pipeline\s*$/m);
  assert.match(yaml, /push:/);
});

test("ci workflow uses pinned commit SHA for actions/checkout", () => {
  const yaml = readWorkflow();
  // Every actions/checkout reference must be pinned to a 40-character
  // commit SHA — no floating @v4 / @main / @release tags allowed.
  const referenceRe = /uses:\s*actions\/checkout@(\S+)/g;
  const refs = [...yaml.matchAll(referenceRe)];
  assert.ok(refs.length > 0, "expected at least one actions/checkout usage");
  for (const [, ref] of refs) {
    assert.match(
      ref,
      /^[0-9a-f]{40}$/,
      `actions/checkout must be pinned to a 40-character commit SHA (saw '${ref}')`,
    );
  }
});

test("ci workflow uses pinned commit SHA for actions/configure-pages", () => {
  const yaml = readWorkflow();
  assert.match(
    yaml,
    /uses:\s*actions\/configure-pages@[0-9a-f]{40}/,
    "actions/configure-pages must be pinned to a 40-character commit SHA",
  );
});

test("ci workflow uses pinned commit SHA for actions/upload-pages-artifact", () => {
  const yaml = readWorkflow();
  assert.match(
    yaml,
    /uses:\s*actions\/upload-pages-artifact@[0-9a-f]{40}/,
    "actions/upload-pages-artifact must be pinned to a 40-character commit SHA",
  );
});

test("ci workflow uses pinned commit SHA for actions/deploy-pages", () => {
  const yaml = readWorkflow();
  assert.match(
    yaml,
    /uses:\s*actions\/deploy-pages@[0-9a-f]{40}/,
    "actions/deploy-pages must be pinned to a 40-character commit SHA",
  );
});

test("ci workflow has no third-party action pinned by floating tag", () => {
  const yaml = readWorkflow();
  // Strip comments so the `# actions/foo@vX.Y.Z` annotation lines are
  // not flagged as `uses:` references.
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

test("ci workflow preserves least-privilege permissions for Pages deploy job", () => {
  const yaml = readWorkflow();
  // The deploy-pages job needs pages: write and id-token: write — those
  // are the elevated permissions the issue calls out. Confirm both are
  // still present so a regression cannot silently drop them.
  assert.match(yaml, /pages:\s*write/);
  assert.match(yaml, /id-token:\s*write/);
});
