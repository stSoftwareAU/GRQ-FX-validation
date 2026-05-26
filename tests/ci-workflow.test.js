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
  assert.match(yaml, /pull_request:/);
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

test("ci workflow setup-node step uses a supported LTS Node version (issue #38)", () => {
  // Node.js 20 is flagged "EOL soon": GitHub-hosted runners are scheduled
  // to force-upgrade `node-version: "20"` to Node 24 on 2026-06-02 and
  // remove the node20 runtime on 2026-09-16. The quality job must pin a
  // current LTS (Node 22 today; Node 24 once it reaches LTS) or
  // `lts/*` to track LTS automatically.
  const yaml = readWorkflow();
  const setupNodeRefs = [
    ...yaml.matchAll(
      /uses:\s*actions\/setup-node@[0-9a-f]{40}[^\n]*\n(?:[^\n]*\n)*?\s+node-version:\s*"?([^"\n]+)"?/g,
    ),
  ];
  assert.ok(
    setupNodeRefs.length > 0,
    "expected at least one actions/setup-node step with a node-version key",
  );
  const allowed = new Set(["22", "24", "lts/*"]);
  for (const [, version] of setupNodeRefs) {
    const v = version.trim();
    assert.ok(
      allowed.has(v),
      `setup-node must target a supported LTS (one of ${[...allowed].join(", ")}), saw '${v}'`,
    );
  }
});

test("ci workflow declares a top-level minimal permissions block (issue #37)", () => {
  // The default GITHUB_TOKEN scope is broad; the GitHub Actions
  // security-hardening guide recommends every workflow narrow it to the
  // minimum required at the top level. Issue #37 mandates
  // `permissions: contents: read` at the workflow scope so the
  // check-changes and quality jobs cannot inherit write access they do
  // not need. The deploy-pages job's per-job permissions override this
  // safely.
  const yaml = readWorkflow();
  const lines = yaml.split("\n");
  // Find the first top-level (column-0) `permissions:` key.
  const topLevelIdx = lines.findIndex((line) => /^permissions:\s*$/.test(line));
  assert.notEqual(
    topLevelIdx,
    -1,
    "expected a top-level `permissions:` block in ci.yml",
  );
  // The next non-blank, non-comment line should declare `contents: read`
  // indented under the top-level key.
  const next = lines
    .slice(topLevelIdx + 1)
    .find((line) => line.trim() !== "" && !/^\s*#/.test(line));
  assert.ok(next, "expected at least one key under top-level permissions");
  assert.match(
    next,
    /^\s+contents:\s*read\s*$/,
    `expected 'contents: read' under top-level permissions, saw '${next}'`,
  );
});
