// Regression tests for the Markdown Lint workflow (issue #4).
//
// Australian English: these tests verify the workflow file and the
// markdownlint-cli2 configuration are present and well-formed so the
// CI gate cannot regress silently.
//
// Issue #42: assertions previously regex-matched the raw YAML text;
// they now parse the workflow into a JavaScript object and assert on
// its structured fields.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadWorkflow, workflowPath } from "./_workflow-yaml.js";

const WORKFLOW = "markdown-lint.yml";
const SHA_RE = /^[0-9a-f]{40}$/;
const CONFIG_PATH = path.join(
  path.resolve(process.cwd()),
  ".markdownlint-cli2.jsonc",
);

test("markdown-lint workflow file exists", () => {
  assert.ok(
    fs.existsSync(workflowPath(WORKFLOW)),
    `Expected workflow at ${workflowPath(WORKFLOW)}`,
  );
});

test("workflow declares the expected name and triggers", () => {
  const wf = loadWorkflow(WORKFLOW);
  assert.equal(wf.name, "Markdown Lint");
  assert.ok(wf.on, "workflow must declare an `on:` block");
  assert.ok(
    "pull_request" in wf.on,
    "workflow must run on pull_request events",
  );
  assert.ok("push" in wf.on, "workflow must run on push events");
});

test("workflow uses pinned commit SHAs for third-party actions", () => {
  const wf = loadWorkflow(WORKFLOW);
  const steps = wf.jobs.markdownlint.steps;
  const required = [
    "actions/checkout",
    "actions/setup-node",
    "denoland/setup-deno",
  ];
  for (const action of required) {
    const step = steps.find(
      (s) =>
        typeof s.uses === "string" && s.uses.startsWith(`${action}@`),
    );
    assert.ok(step, `expected a step that uses ${action}`);
    const ref = step.uses.split("@")[1];
    assert.match(
      ref,
      SHA_RE,
      `${action} must be pinned to a 40-character commit SHA (saw '${ref}')`,
    );
  }
});

test("workflow installs and runs markdownlint-cli2", () => {
  const wf = loadWorkflow(WORKFLOW);
  const steps = wf.jobs.markdownlint.steps;
  const install = steps.find(
    (s) => typeof s.run === "string" &&
      /npm install -g markdownlint-cli2/.test(s.run),
  );
  assert.ok(install, "expected a step that installs markdownlint-cli2");
  const run = steps.find(
    (s) => typeof s.run === "string" &&
      /^\s*markdownlint-cli2\b/.test(s.run),
  );
  assert.ok(run, "expected a step that runs markdownlint-cli2");
});

// Issue #138: an `npm install` in a `run:` step that names no exact
// version resolves whatever the registry serves at that moment, so a
// hijacked release executes on the runner — with GITHUB_TOKEN and every
// secret in scope — the instant it is published. Renovate's
// minimumReleaseAge quarantine only covers manifests a manager can read
// and a `run:` block is not a manifest, so the literal pin is the only
// embargo available here. Asserting across every install in the job
// (rather than the markdownlint-cli2 spelling alone) means a future
// unpinned install added to this workflow fails too.
const EXACT_VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

// Collect the package specs named by every `npm install`/`i`/`add`
// invocation in a run block, dropping flags and stopping at a shell
// separator so a following command is not mistaken for a package.
function npmInstallSpecs(run) {
  const specs = [];
  for (const m of run.matchAll(/\bnpm\s+(?:install|i|add)\b([^\n&|;]*)/g)) {
    for (const word of m[1].trim().split(/\s+/).filter(Boolean)) {
      if (word.startsWith("-")) continue;
      specs.push(word);
    }
  }
  return specs;
}

test("every npm install in the workflow pins an exact version (issue #138)", () => {
  const wf = loadWorkflow(WORKFLOW);
  const steps = wf.jobs.markdownlint.steps ?? [];
  const specs = steps
    .filter((s) => typeof s.run === "string")
    .flatMap((s) => npmInstallSpecs(s.run));
  assert.ok(
    specs.length > 0,
    "expected at least one npm install step in the markdownlint job",
  );
  for (const spec of specs) {
    // lastIndexOf so a scoped package (@scope/name@1.2.3) splits on the
    // version separator, not on the scope marker.
    const at = spec.lastIndexOf("@");
    assert.ok(
      at > 0,
      `\`${spec}\` is installed without a version — pin it (e.g. ${spec}@1.2.3) so a hijacked release cannot run on the runner`,
    );
    assert.match(
      spec.slice(at + 1),
      EXACT_VERSION_RE,
      `\`${spec}\` must name an exact version, not a range, tag or floating ref`,
    );
  }
});

test("workflow uses least-privilege permissions", () => {
  const wf = loadWorkflow(WORKFLOW);
  const top = wf.permissions ?? {};
  const job = wf.jobs.markdownlint.permissions ?? {};
  const contents = job.contents ?? top.contents;
  assert.equal(
    contents,
    "read",
    "contents permission must be 'read' for the markdownlint job",
  );
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

// Issue #144: GitHub's single-level `*` glob does not match a `/`, so a
// pull_request filter without `milestone/*` silently skips PRs into
// milestone/<name> branches and the milestone ruleset's required check
// can never report, leaving those PRs permanently blocked.
test("markdown lint workflow runs on PRs into milestone/* branches", () => {
  const wf = loadWorkflow(WORKFLOW);
  const branches = wf.on.pull_request.branches;
  assert.ok(Array.isArray(branches), "pull_request.branches must be a list");
  assert.ok(
    branches.includes("milestone/*"),
    `pull_request.branches must include "milestone/*", got ${
      JSON.stringify(branches)
    }`,
  );
});

// Issue #128: actions/checkout writes GITHUB_TOKEN into .git/config as an
// auth header by default, where any later step in the job can read it and
// act as the token. The markdownlint job runs `npm install -g
// markdownlint-cli2` and a Deno script, so third-party code executes after
// the checkout; the job never pushes back to the repository and fetches no
// private submodules, so the credential must not reach disk.
test("markdownlint checkout does not persist the workflow token (issue #128)", () => {
  const wf = loadWorkflow(WORKFLOW);
  const checkouts = (wf.jobs.markdownlint.steps ?? []).filter(
    (s) => typeof s?.uses === "string" &&
      s.uses.startsWith("actions/checkout@"),
  );
  assert.ok(
    checkouts.length > 0,
    "expected an actions/checkout step in markdownlint",
  );
  for (const step of checkouts) {
    assert.equal(
      step.with?.["persist-credentials"],
      false,
      "markdownlint actions/checkout must set persist-credentials: false",
    );
  }
});
