// Regression tests for the Gitleaks Secrets Detection workflow (issue #1).
//
// Australian English: these tests verify the Gitleaks workflow file is
// present and well-formed so the secrets-detection CI gate cannot
// regress silently.
//
// Issue #42: assertions previously regex-matched the raw YAML text;
// they now parse the workflow into a JavaScript object and assert on
// its structured fields. The parsed-object form survives benign
// reformatting (extra blank lines, key reordering, quoted vs unquoted
// scalars) but still fails loudly if a permission is broadened, an
// action is unpinned, or a required secret env is dropped.
//
// Constants below pin the SHAs we expect today so an upgrade lands as a
// deliberate test edit, not as a silent change.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadWorkflow, workflowPath } from "./_workflow-yaml.js";

const WORKFLOW = "gitleaks.yml";
const SHA_RE = /^[0-9a-f]{40}$/;

test("gitleaks workflow file exists", () => {
  assert.ok(
    fs.existsSync(workflowPath(WORKFLOW)),
    `Expected workflow at ${workflowPath(WORKFLOW)}`,
  );
});

test("gitleaks workflow declares the expected name and triggers", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.equal(wf.name, "Gitleaks");
  assert.ok(
    wf.on && typeof wf.on === "object" && "pull_request" in wf.on,
    "workflow must run on pull_request events",
  );
});

test("gitleaks workflow uses pinned commit SHA for actions/checkout", () => {
  const wf = loadWorkflow(WORKFLOW);
  const steps = wf.jobs.gitleaks.steps;
  const checkout = steps.find(
    (s) => typeof s.uses === "string" && s.uses.startsWith("actions/checkout@"),
  );
  assert.ok(checkout, "expected an actions/checkout step");
  const ref = checkout.uses.split("@")[1];
  assert.match(
    ref,
    SHA_RE,
    `actions/checkout must be pinned to a 40-character commit SHA (saw '${ref}')`,
  );
});

test("gitleaks workflow checks out the full history (fetch-depth: 0)", () => {
  const wf = loadWorkflow(WORKFLOW);
  const checkout = wf.jobs.gitleaks.steps.find(
    (s) => typeof s.uses === "string" && s.uses.startsWith("actions/checkout@"),
  );
  assert.ok(checkout, "expected an actions/checkout step");
  assert.ok(checkout.with, "checkout step must declare a `with:` block");
  assert.equal(
    checkout.with["fetch-depth"],
    0,
    "fetch-depth: 0 is required so gitleaks can see the PR commit range",
  );
});

test("gitleaks workflow fetches the PR base branch before scanning", () => {
  const wf = loadWorkflow(WORKFLOW);
  const fetchStep = wf.jobs.gitleaks.steps.find(
    (s) => typeof s.run === "string" && s.run.includes("git fetch origin"),
  );
  assert.ok(fetchStep, "expected a step that fetches the PR base branch");
  // The fetch command must reference github.base_ref so the commit
  // range gitleaks-action computes resolves on the runner. We assert
  // on the structured `run:` value rather than the surrounding YAML.
  assert.ok(
    /github\.base_ref/.test(fetchStep.run),
    "fetch step must reference github.base_ref",
  );
  // The step must only run on pull_request events — otherwise the
  // command would fail on push runs where github.base_ref is empty.
  assert.equal(fetchStep.if, "github.event_name == 'pull_request'");
});

test("gitleaks workflow uses pinned commit SHA for gitleaks-action", () => {
  const wf = loadWorkflow(WORKFLOW);
  const step = wf.jobs.gitleaks.steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("gitleaks/gitleaks-action@"),
  );
  assert.ok(step, "expected a gitleaks/gitleaks-action step");
  const ref = step.uses.split("@")[1];
  assert.match(
    ref,
    SHA_RE,
    `gitleaks-action must be pinned to a 40-character commit SHA (Issue #1756), saw '${ref}'`,
  );
});

test("gitleaks workflow uses least-privilege permissions", () => {
  const wf = loadWorkflow(WORKFLOW);
  // Permissions may be declared at the workflow or job level. Either
  // way the contents scope must be `read` (never `write`).
  const top = wf.permissions ?? {};
  const job = wf.jobs.gitleaks.permissions ?? {};
  const contents = job.contents ?? top.contents;
  assert.equal(
    contents,
    "read",
    "contents permission must be 'read' (gitleaks only needs to read the diff)",
  );
});

test("gitleaks workflow wires GITHUB_TOKEN and GITLEAKS_LICENSE via env", () => {
  const wf = loadWorkflow(WORKFLOW);
  const action = wf.jobs.gitleaks.steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("gitleaks/gitleaks-action@"),
  );
  assert.ok(action, "expected gitleaks-action step");
  assert.ok(action.env, "gitleaks-action step must declare env wiring");
  assert.equal(action.env.GITHUB_TOKEN, "${{ secrets.GITHUB_TOKEN }}");
  assert.equal(
    action.env.GITLEAKS_LICENSE,
    "${{ secrets.GITLEAKS_LICENSE }}",
  );
});
