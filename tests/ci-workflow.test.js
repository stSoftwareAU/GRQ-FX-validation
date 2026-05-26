// Regression tests for the CI/CD Pipeline workflow (issue #14).
//
// Australian English: these tests verify that third-party actions
// referenced from ci.yml are pinned to 40-character commit SHAs so a
// hijacked tag cannot exfiltrate CI secrets or publish arbitrary
// content to GitHub Pages.
//
// Issue #42: assertions previously regex-matched the raw YAML text;
// they now parse the workflow into a JavaScript object and assert on
// its structured fields (job permissions, step `uses` refs, container
// images, env wiring). The parsed-object form survives benign
// reformatting but still fails loudly if permissions are broadened, an
// action is unpinned, or the bash-hardening guard is dropped.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  collectActionRefs,
  loadWorkflow,
  workflowPath,
} from "./_workflow-yaml.js";

const WORKFLOW = "ci.yml";
const SHA_RE = /^[0-9a-f]{40}$/;

test("ci workflow file exists", () => {
  assert.ok(
    fs.existsSync(workflowPath(WORKFLOW)),
    `Expected workflow at ${workflowPath(WORKFLOW)}`,
  );
});

test("ci workflow declares the expected name and trigger", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.equal(wf.name, "CI/CD Pipeline");
  assert.ok(wf.on, "workflow must declare an `on:` block");
  assert.ok(
    "pull_request" in wf.on,
    "workflow must run on pull_request events",
  );
  assert.ok("push" in wf.on, "workflow must run on push events");
});

test("ci workflow uses pinned commit SHA for actions/checkout", () => {
  // Every actions/checkout reference must be pinned to a 40-character
  // commit SHA — no floating @v4 / @main / @release tags allowed.
  const wf = loadWorkflow(WORKFLOW);
  const refs = collectActionRefs(wf).filter(
    ({ action }) => action === "actions/checkout",
  );
  assert.ok(refs.length > 0, "expected at least one actions/checkout usage");
  for (const { ref } of refs) {
    assert.match(
      ref,
      SHA_RE,
      `actions/checkout must be pinned to a 40-character commit SHA (saw '${ref}')`,
    );
  }
});

test("ci workflow uses pinned commit SHA for actions/configure-pages", () => {
  const wf = loadWorkflow(WORKFLOW);
  const refs = collectActionRefs(wf).filter(
    ({ action }) => action === "actions/configure-pages",
  );
  assert.ok(refs.length > 0, "expected an actions/configure-pages usage");
  for (const { ref } of refs) {
    assert.match(
      ref,
      SHA_RE,
      `actions/configure-pages must be pinned to a 40-character commit SHA (saw '${ref}')`,
    );
  }
});

test("ci workflow uses pinned commit SHA for actions/upload-pages-artifact", () => {
  const wf = loadWorkflow(WORKFLOW);
  const refs = collectActionRefs(wf).filter(
    ({ action }) => action === "actions/upload-pages-artifact",
  );
  assert.ok(refs.length > 0, "expected an actions/upload-pages-artifact usage");
  for (const { ref } of refs) {
    assert.match(
      ref,
      SHA_RE,
      `actions/upload-pages-artifact must be pinned to a 40-character commit SHA (saw '${ref}')`,
    );
  }
});

test("ci workflow uses pinned commit SHA for actions/deploy-pages", () => {
  const wf = loadWorkflow(WORKFLOW);
  const refs = collectActionRefs(wf).filter(
    ({ action }) => action === "actions/deploy-pages",
  );
  assert.ok(refs.length > 0, "expected an actions/deploy-pages usage");
  for (const { ref } of refs) {
    assert.match(
      ref,
      SHA_RE,
      `actions/deploy-pages must be pinned to a 40-character commit SHA (saw '${ref}')`,
    );
  }
});

test("ci workflow has no third-party action pinned by floating tag", () => {
  const wf = loadWorkflow(WORKFLOW);
  const refs = collectActionRefs(wf);
  const floating = refs.filter(({ ref }) => !SHA_RE.test(ref));
  assert.deepEqual(
    floating,
    [],
    "third-party actions must be pinned to commit SHAs, not floating tags",
  );
});

test("ci workflow preserves least-privilege permissions for Pages deploy job", () => {
  // The deploy-pages job needs pages: write and id-token: write — those
  // are the elevated permissions the issue calls out. Confirm both are
  // still present so a regression cannot silently drop them.
  const wf = loadWorkflow(WORKFLOW);
  const perms = wf.jobs["deploy-pages"].permissions ?? {};
  assert.equal(perms.pages, "write");
  assert.equal(perms["id-token"], "write");
});

test("ci workflow setup-node step uses a supported LTS Node version (issue #38)", () => {
  // Node.js 20 is flagged "EOL soon": GitHub-hosted runners are scheduled
  // to force-upgrade `node-version: "20"` to Node 24 on 2026-06-02 and
  // remove the node20 runtime on 2026-09-16. The quality job must pin a
  // current LTS (Node 22 today; Node 24 once it reaches LTS) or
  // `lts/*` to track LTS automatically.
  const wf = loadWorkflow(WORKFLOW);
  const allowed = new Set(["22", "24", "lts/*"]);
  let found = 0;
  for (const job of Object.values(wf.jobs)) {
    for (const step of job.steps ?? []) {
      if (
        typeof step.uses === "string" &&
        step.uses.startsWith("actions/setup-node@")
      ) {
        const version = String(step.with?.["node-version"] ?? "").trim();
        found++;
        assert.ok(
          allowed.has(version),
          `setup-node must target a supported LTS (one of ${[...allowed].join(", ")}), saw '${version}'`,
        );
      }
    }
  }
  assert.ok(found > 0, "expected at least one actions/setup-node step");
});

test("ci workflow 'Check for changes' step hardens bash with set -euo pipefail (issue #41)", () => {
  // The multi-line `run:` block in the Check for changes step is the
  // gate that decides whether the GitHub Pages deploy fires. Without
  // `set -euo pipefail` an interim failure silently produces an empty
  // changed_files.txt and downstream `docs-changed` reports `false`.
  // Issue #41 hardens the block with the documented `set -euo pipefail`
  // guard and an explicit `shell: bash` so the shell flags are
  // well-defined on every runner.
  const wf = loadWorkflow(WORKFLOW);
  const job = wf.jobs["check-changes"];
  assert.ok(job, "expected a 'check-changes' job in ci.yml");
  const step = job.steps.find((s) => s.name === "Check for changes");
  assert.ok(step, "expected a 'Check for changes' step in ci.yml");
  assert.equal(
    step.shell,
    "bash",
    "Check for changes step must declare `shell: bash` for explicit bash semantics",
  );

  assert.ok(
    typeof step.run === "string" && step.run.length > 0,
    "Check for changes step must use a run: block",
  );
  // The first non-blank, non-comment line of the run block must be
  // `set -euo pipefail` so the hardening fires before any subsequent
  // command can mask a failure.
  const firstCmd = step.run
    .split("\n")
    .find((l) => l.trim() !== "" && !/^\s*#/.test(l));
  assert.ok(firstCmd, "Check for changes run block must have at least one command");
  assert.equal(
    firstCmd.trim(),
    "set -euo pipefail",
    `expected first command to be 'set -euo pipefail', saw '${firstCmd}'`,
  );
});

test("ci workflow declares a top-level minimal permissions block (issue #37)", () => {
  // The default GITHUB_TOKEN scope is broad; the GitHub Actions
  // security-hardening guide recommends every workflow narrow it to the
  // minimum required at the top level. Issue #37 mandates
  // `permissions: contents: read` at the workflow scope so the
  // check-changes and quality jobs cannot inherit write access they do
  // not need. The deploy-pages job's per-job permissions override this
  // safely.
  const wf = loadWorkflow(WORKFLOW);
  assert.ok(
    wf.permissions && typeof wf.permissions === "object",
    "expected a top-level `permissions:` block in ci.yml",
  );
  assert.equal(
    wf.permissions.contents,
    "read",
    `expected top-level contents: read, saw '${wf.permissions.contents}'`,
  );
});
