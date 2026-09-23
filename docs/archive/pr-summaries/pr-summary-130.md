# PR Summary — Issue #130

## Summary

Closes #130.

`actions/checkout` defaults to `persist-credentials: true`, which writes the
workflow's `GITHUB_TOKEN` into `.git/config` as an extra-header auth entry.
Every later step in the same job can read that file, so the token is available
to anything the job runs afterwards — including third-party code the workflow
pulls in at runtime.

The finding is a true positive for the `semgrep` job. The job checks out the
tree, then runs `semgrep ci --config p/default` inside the pinned
`semgrep/semgrep` container. That command downloads and executes third-party
rule packs, and it runs with `SEMGREP_APP_TOKEN` in its environment, so
untrusted code executes after the checkout in the same job. Nothing in the job
pushes back to the repository, publishes a release asset, or fetches a private
submodule, and the repository is public so no credential is needed to read it.
The checkout credential therefore has no legitimate consumer and must not reach
disk. No `best-practice-ignore` suppression is warranted.

The change adds `with: persist-credentials: false` to the checkout step in
`.github/workflows/semgrep.yml`, with a comment recording why. The pinned
action SHA and its version comment are untouched, as is the sha256-pinned
container image.

## Evidence

CLI/workflow-only change — no visual surface, so no screenshot is required.

- **Red** — before the workflow edit,
  `node --test tests/semgrep-workflow.test.js` failed the new case with
  `AssertionError [ERR_ASSERTION]` — `semgrep actions/checkout must set
  persist-credentials: false`, `actual undefined`, `expected false`.
- **Green after the edit** — the same command reported `tests 9 / pass 9 /
  fail 0`.
- **Full gate** — `./quality.sh < /dev/null` finished with
  `ok | 95 passed | 0 failed` and `[quality] All checks passed.`

## Test Plan

- Added `semgrep checkout does not persist the workflow token (issue #130)` to
  `tests/semgrep-workflow.test.js`. It parses the real workflow YAML through
  `loadWorkflow`, finds every `actions/checkout` step in the `semgrep` job, and
  asserts each one sets `persist-credentials` to `false`. The assertion is made
  against the parsed structure, not the raw text, so reformatting cannot break
  it while a genuine regression still fails it.
- The test fails against the unfixed workflow and passes after the fix.
- The full quality gate passes.
- No existing test was changed, commented out, or removed.
