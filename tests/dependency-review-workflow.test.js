// Regression tests for the Dependency Review workflow (issue #14).
//
// Australian English: these tests verify that third-party actions
// referenced from dependency-review.yml are pinned to 40-character
// commit SHAs so a hijacked tag cannot influence the supply-chain
// review running on every PR.
//
// Issue #42: assertions previously regex-matched the raw YAML text;
// they now parse the workflow into a JavaScript object and assert on
// its structured fields.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  branchMatchesFilters,
  collectActionRefs,
  loadWorkflow,
  workflowPath,
} from "./_workflow-yaml.js";

const WORKFLOW = "dependency-review.yml";
const SHA_RE = /^[0-9a-f]{40}$/;

test("dependency-review workflow file exists", () => {
  assert.ok(
    fs.existsSync(workflowPath(WORKFLOW)),
    `Expected workflow at ${workflowPath(WORKFLOW)}`,
  );
});

test("dependency-review workflow declares the expected name and trigger", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.equal(wf.name, "Dependency Review");
  assert.ok(
    wf.on && "pull_request" in wf.on,
    "workflow must run on pull_request events",
  );
});

test("dependency-review workflow uses pinned commit SHA for actions/checkout", () => {
  const wf = loadWorkflow(WORKFLOW);
  const step = wf.jobs["dependency-review"].steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("actions/checkout@"),
  );
  assert.ok(step, "expected an actions/checkout step");
  const ref = step.uses.split("@")[1];
  assert.match(
    ref,
    SHA_RE,
    `actions/checkout must be pinned to a 40-character commit SHA (saw '${ref}')`,
  );
});

test("dependency-review workflow uses pinned commit SHA for actions/dependency-review-action", () => {
  const wf = loadWorkflow(WORKFLOW);
  const step = wf.jobs["dependency-review"].steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("actions/dependency-review-action@"),
  );
  assert.ok(step, "expected an actions/dependency-review-action step");
  const ref = step.uses.split("@")[1];
  assert.match(
    ref,
    SHA_RE,
    `actions/dependency-review-action must be pinned to a 40-character commit SHA (saw '${ref}')`,
  );
});

test("dependency-review workflow has no third-party action pinned by floating tag", () => {
  const wf = loadWorkflow(WORKFLOW);
  const refs = collectActionRefs(wf);
  const floating = refs.filter(({ ref }) => !SHA_RE.test(ref));
  assert.deepEqual(
    floating,
    [],
    "third-party actions must be pinned to commit SHAs, not floating tags",
  );
});

test("dependency-review workflow uses least-privilege permissions", () => {
  const wf = loadWorkflow(WORKFLOW);
  const top = wf.permissions ?? {};
  const job = wf.jobs["dependency-review"].permissions ?? {};
  const contents = job.contents ?? top.contents;
  assert.equal(
    contents,
    "read",
    "contents permission must be 'read' for the dependency-review job",
  );
});

// Issue #127: actions/checkout writes GITHUB_TOKEN into .git/config as an
// auth header by default, where any later step in the job — a compromised
// dependency, an injected script — can read it and act as the token. The
// dependency-review job only checks out the tree so
// actions/dependency-review-action can scan it; it never pushes back to the
// repository and fetches no private submodules, so the credential must not
// reach disk.
test("dependency-review checkout does not persist the workflow token (issue #127)", () => {
  const wf = loadWorkflow(WORKFLOW);
  const checkouts = (wf.jobs["dependency-review"].steps ?? []).filter(
    (s) => typeof s?.uses === "string" &&
      s.uses.startsWith("actions/checkout@"),
  );
  assert.ok(
    checkouts.length > 0,
    "expected an actions/checkout step in dependency-review",
  );
  for (const step of checkouts) {
    assert.equal(
      step.with?.["persist-credentials"],
      false,
      "dependency-review actions/checkout must set persist-credentials: false",
    );
  }
});

// Issue #144: milestone sub-issue PRs merge into a shared
// `milestone/<name>` branch before a single rollup PR reaches the
// default branch. GitHub's `*` glob stops at `/`, so a filter of ["*"]
// left every milestone PR unscanned by this dependency-vulnerability
// gate.

test("dependency-review runs on a milestone branch PR", () => {
  const wf = loadWorkflow(WORKFLOW);
  const branches = wf.on.pull_request?.branches;
  assert.equal(
    branchMatchesFilters(branches, "milestone/scan-20260910"),
    true,
    `pull_request.branches (${JSON.stringify(branches)}) must select ` +
      "milestone/<name> branches so milestone PRs are scanned",
  );
});

test("dependency-review still runs on a flat branch PR", () => {
  const wf = loadWorkflow(WORKFLOW);
  const branches = wf.on.pull_request?.branches;
  for (const branch of ["Develop", "main", "feature-144"]) {
    assert.equal(
      branchMatchesFilters(branches, branch),
      true,
      `pull_request.branches must still select '${branch}'`,
    );
  }
});
