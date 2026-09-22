# PR Summary — Issue #128

## Summary

Closes #128.

`actions/checkout` defaults to `persist-credentials: true`, which writes the
workflow's `GITHUB_TOKEN` into `.git/config` as an auth header. Every step that
runs after the checkout — including third-party code — can read that file and
act as the token for the remainder of the job.

The `markdownlint` job is a true positive rather than a false alarm. It checks
the tree out purely so `markdownlint-cli2` and the optional Mermaid validator
can scan it; nothing in the job pushes back to the repository, publishes a
release asset, or fetches a private submodule, and the workflow already runs
under least-privilege `contents: read`. The exposure is real because the job
installs `markdownlint-cli2` from npm and then runs a Deno script, so
third-party code executes in the same workspace as the persisted credential.
No `best-practice-ignore` suppression is warranted.

The change adds a `with:` block to the checkout step in
`.github/workflows/markdown-lint.yml` setting `persist-credentials: false`,
with a comment recording the reasoning. The existing pinned SHA and its
`# actions/checkout@v4.3.1` version comment are untouched.

## Evidence

CLI/workflow-only change — no visual surface, so no screenshot is required.

- **Red** — the new test failed against the unfixed workflow with
  `AssertionError [ERR_ASSERTION] markdownlint actions/checkout must set
  persist-credentials: false`, `actual: undefined`, `expected: false`.
- **Green after the edit** — `node --test tests/markdown-lint-workflow.test.js`
  reports `tests 8 / pass 8 / fail 0`.
- **Full gate** — `./quality.sh` reports `ok | 95 passed | 0 failed` and
  `[quality] All checks passed.`

## Test Plan

- Added `tests/markdown-lint-workflow.test.js::markdownlint checkout does not
  persist the workflow token (issue #128)`, which parses the real workflow
  through `loadWorkflow` and asserts every `actions/checkout` step in the
  `markdownlint` job sets `persist-credentials` to `false`. It fails against
  the unfixed workflow and passes after the fix.
- Full quality gate green — `./quality.sh` → `[quality] All checks passed.`
- No existing test was changed, commented out, or removed.
