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
import {
  collectActionRefs,
  loadWorkflow,
  workflowPath,
} from "./_workflow-yaml.js";

const WORKFLOW = "gitleaks.yml";
const SHA_RE = /^[0-9a-f]{40}$/;

// Issue #136: the SHA gitleaks/gitleaks-action@v3.0.0 resolves to,
// read from the GitHub API during this change
// (`gh api repos/gitleaks/gitleaks-action/tags`). Locking the value —
// not merely its 40-hex shape — makes an upgrade a deliberate test edit
// and makes a drifted pin fail loudly instead of passing the presence
// check while scanning with a frozen release.
const EXPECTED_GITLEAKS_SHA = "e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e";
const EXPECTED_GITLEAKS_TAG = "v3.0.0";
// gitleaks-action v2 runs on the Node 20 runtime, which GitHub removed
// from hosted runners on 16 September 2026; any v2 pin is dead weight
// however immutable it is. v3 moved to Node 24 with no change to
// inputs, outputs or behaviour.
const MIN_GITLEAKS_MAJOR = 3;

// Issue #137: gitleaks-action needs an organisation licence on org-owned
// repos, and a Dependabot-authored PR receives no Actions secrets — the
// action exits with ErrLicense before scanning anything while the job
// still reports green. The open-source CLI needs no licence, so it runs
// as the fallback whenever the licence is absent. Version and digest were
// read during this change from the GitHub releases API and the release's
// own published `gitleaks_<version>_checksums.txt`.
const EXPECTED_CLI_VERSION = "8.30.1";
const EXPECTED_CLI_SHA256 =
  "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb";
const LICENCE_PRESENT = "env.GITLEAKS_LICENSE != ''";
const LICENCE_ABSENT = "env.GITLEAKS_LICENSE == ''";

// The scanning step that runs when no licence is available.
function fallbackStep(wf) {
  return wf.jobs.gitleaks.steps.find(
    (s) => typeof s.run === "string" && /\bgitleaks\b/.test(s.run) &&
      s.run.includes("--exit-code"),
  );
}

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
  // Issue #159: the ref must reach the shell through `env:` rather than a
  // `${{ }}` splice inside `run:` (semgrep run-shell-injection), so assert
  // the env binding carries github.base_ref and the command uses the
  // variable — never the expression itself.
  const envRef = Object.values(fetchStep.env ?? {}).some(
    (v) => typeof v === "string" && /github\.base_ref/.test(v),
  );
  assert.ok(envRef, "fetch step must bind github.base_ref through env:");
  assert.ok(
    !/\$\{\{/.test(fetchStep.run),
    "fetch step run: must not splice a ${{ }} expression into the shell",
  );
  assert.ok(
    /\$\{?BASE_REF\}?/.test(fetchStep.run),
    "fetch step must fetch the branch named by $BASE_REF",
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

// Issue #136: a shape-only assertion (40 hex characters) is satisfied by
// any SHA, so a pin left behind on an old release still passes while the
// scan it runs has drifted from the ref the fleet emits today. Assert the
// value.
test("gitleaks-action is pinned to the canonical SHA (issue #136)", () => {
  const wf = loadWorkflow(WORKFLOW);
  const ref = collectActionRefs(wf).find(
    (r) => r.action === "gitleaks/gitleaks-action",
  );
  assert.ok(ref, "expected a gitleaks/gitleaks-action step");
  assert.equal(
    ref.ref,
    EXPECTED_GITLEAKS_SHA,
    `gitleaks-action must be pinned to ${EXPECTED_GITLEAKS_TAG} ` +
      `(${EXPECTED_GITLEAKS_SHA}), saw '${ref.ref}'`,
  );
});

// Issue #136: the trailing `# owner/repo@tag` comment is the only record
// of which release a SHA is, so it must move with the pin. A comment left
// on v2.x also flags a runtime GitHub no longer provides.
test("gitleaks-action version comment tracks the pin (issue #136)", () => {
  const raw = fs.readFileSync(workflowPath(WORKFLOW), "utf8").split("\n");
  const pinIndex = raw.findIndex((line) =>
    line.includes(`gitleaks/gitleaks-action@${EXPECTED_GITLEAKS_SHA}`)
  );
  assert.ok(pinIndex > 0, "expected the canonical gitleaks-action pin");

  const comment = raw[pinIndex - 1].match(
    /^\s*#\s*gitleaks\/gitleaks-action@(\S+)\s*$/,
  );
  assert.ok(
    comment,
    `line ${pinIndex} must annotate the pin with its tag, saw '${
      raw[pinIndex - 1]
    }'`,
  );
  assert.equal(comment[1], EXPECTED_GITLEAKS_TAG);

  const major = Number.parseInt(comment[1].replace(/^v/, ""), 10);
  assert.ok(
    Number.isInteger(major) && major >= MIN_GITLEAKS_MAJOR,
    `gitleaks-action must be v${MIN_GITLEAKS_MAJOR} or newer — v2 runs on ` +
      `the Node 20 runtime GitHub removed from hosted runners, saw '${
        comment[1]
      }'`,
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

// Issue #137: the licence moved from the step's own `env:` to the job's,
// because a step-level `if:` cannot read the `secrets` context and so has
// no other way to branch on the licence being absent. The wiring the
// action sees is unchanged — job env is inherited by every step — so this
// test now asserts the effective environment rather than the level it
// happens to be declared at.
test("gitleaks workflow wires GITHUB_TOKEN and GITLEAKS_LICENSE via env", () => {
  const wf = loadWorkflow(WORKFLOW);
  const action = wf.jobs.gitleaks.steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("gitleaks/gitleaks-action@"),
  );
  assert.ok(action, "expected gitleaks-action step");
  const effective = { ...(wf.jobs.gitleaks.env ?? {}), ...(action.env ?? {}) };
  assert.equal(effective.GITHUB_TOKEN, "${{ secrets.GITHUB_TOKEN }}");
  assert.equal(effective.GITLEAKS_LICENSE, "${{ secrets.GITLEAKS_LICENSE }}");
});

// Issue #137: `if:` is evaluated before the step runs and the `secrets`
// context is unavailable there, so the licence must reach the job's own
// `env:` block for either branch condition to be expressible at all.
test("the licence is exposed at job level so an `if:` can read it (issue #137)", () => {
  const wf = loadWorkflow(WORKFLOW);
  const jobEnv = wf.jobs.gitleaks.env ?? {};
  assert.equal(
    jobEnv.GITLEAKS_LICENSE,
    "${{ secrets.GITLEAKS_LICENSE }}",
    "GITLEAKS_LICENSE must be bound in the job's env: — a step-level `if:` " +
      "cannot read the secrets context",
  );
});

// Issue #137: without this guard the licensed action runs on a Dependabot
// PR, exits with ErrLicense before scanning, and leaves the job green over
// an unscanned diff — worse than no gate, because it reads as covered.
test("the licensed action only runs when a licence is present (issue #137)", () => {
  const wf = loadWorkflow(WORKFLOW);
  const action = wf.jobs.gitleaks.steps.find(
    (s) => typeof s.uses === "string" &&
      s.uses.startsWith("gitleaks/gitleaks-action@"),
  );
  assert.ok(action, "expected gitleaks-action step");
  assert.equal(
    action.if,
    LICENCE_PRESENT,
    `gitleaks-action must be gated on \`${LICENCE_PRESENT}\`, saw '${action.if}'`,
  );
});

test("a licence-less CLI fallback scans the diff (issue #137)", () => {
  const wf = loadWorkflow(WORKFLOW);
  const fallback = fallbackStep(wf);
  assert.ok(
    fallback,
    "expected a `run:` step invoking the open-source gitleaks CLI",
  );
  assert.equal(
    fallback.if,
    LICENCE_ABSENT,
    `the fallback must be gated on \`${LICENCE_ABSENT}\`, saw '${fallback.if}'`,
  );
  // The two conditions must be complementary so exactly one scanner runs.
  assert.match(fallback.run, /gitleaks(["']?)\s+git\b/);
  assert.match(
    fallback.run,
    /--exit-code\s+1/,
    "the fallback must fail the job on a finding, not merely report one",
  );
  assert.match(
    fallback.run,
    /--redact/,
    "the fallback must redact matches so a secret is not echoed into the log",
  );
  assert.match(
    fallback.run,
    /--log-opts/,
    "the fallback must scan the PR commit range, not the whole history",
  );
});

test("the fallback pins the CLI version and verifies its digest (issue #137)", () => {
  const wf = loadWorkflow(WORKFLOW);
  const fallback = fallbackStep(wf);
  assert.ok(fallback, "expected the CLI fallback step");
  // The version and digest may be declared in the step's env: or written
  // inline in the shell — either way they must be literal, so assert on
  // everything the step contributes rather than on one of the two spellings.
  const declared = fallback.run + "\n" +
    Object.values(fallback.env ?? {}).join("\n");
  assert.ok(
    declared.includes(EXPECTED_CLI_VERSION),
    `the fallback must pin gitleaks ${EXPECTED_CLI_VERSION} exactly — an ` +
      "unpinned download is an unreviewed binary in CI",
  );
  assert.ok(
    !/latest/.test(declared),
    "the fallback must not resolve a floating `latest` release",
  );
  assert.ok(
    declared.includes(EXPECTED_CLI_SHA256),
    "the fallback must carry the published SHA-256 of the pinned archive",
  );
  assert.match(
    fallback.run,
    /sha256sum\s+(--check|-c)/,
    "the pinned digest must actually be checked, not merely recorded",
  );
});

test("the fallback run: is strict-mode and injection-free (issue #137)", () => {
  const wf = loadWorkflow(WORKFLOW);
  const fallback = fallbackStep(wf);
  assert.ok(fallback, "expected the CLI fallback step");
  assert.equal(
    fallback.run.split("\n")[0].trim(),
    "set -euo pipefail",
    "a multi-line run: must abort on the first failure, an unset variable " +
      "or a broken pipe",
  );
  // Issue #159's rule applies to every run: in this workflow — the commit
  // range reaches the shell through env: and is quoted there, never
  // spliced in as a ${{ }} expression.
  assert.ok(
    !/\$\{\{/.test(fallback.run),
    "fallback run: must not splice a ${{ }} expression into the shell",
  );
  const env = fallback.env ?? {};
  assert.match(String(env.BASE_SHA), /github\.event\.pull_request\.base\.sha/);
  assert.match(String(env.HEAD_SHA), /github\.event\.pull_request\.head\.sha/);
  assert.match(fallback.run, /"\$\{BASE_SHA\}\.\.\$\{HEAD_SHA\}"/);
});

// Issue #144: GitHub's single-level `*` glob does not match a `/`, so a
// pull_request filter without `milestone/*` silently skips PRs into
// milestone/<name> branches and the milestone ruleset's required check
// can never report, leaving those PRs permanently blocked.
test("gitleaks workflow runs on PRs into milestone/* branches", () => {
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
