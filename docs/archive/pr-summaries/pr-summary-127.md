# PR Summary — Issue #127

## Summary

Closes #127.

`actions/checkout` writes the workflow's `GITHUB_TOKEN` into `.git/config` as an
auth header unless told not to, so every later step in the job — including a
compromised dependency or an injected script — can read the credential and act
as the token. The `dependency-review` job in
`.github/workflows/dependency-review.yml` had no such guard.

The job needs no write credential: it checks the tree out purely so
`actions/dependency-review-action` can scan the PR's dependency changes, and
that action authenticates through its own `github-token` input rather than
through `.git/config`. Nothing in the job pushes back to the repository,
publishes a release asset, or fetches a private submodule, and the workflow
already runs under `permissions: contents: read`. This is a true positive, not
a case for the `best-practice-ignore` escape.

The fix adds `persist-credentials: false` under the checkout step's `with:`,
leaving the pinned SHA and its `# actions/checkout@v4.3.1` version comment
untouched.

## Evidence

CLI/workflow-only change — no visual surface, so no screenshot is required.

- Red: `node --test tests/dependency-review-workflow.test.js` failed with
  `dependency-review actions/checkout must set persist-credentials: false`
  (actual `undefined`, expected `false`) before the workflow edit.
- Green after the edit: `tests 9 / pass 9 / fail 0`.
- Full gate: `./quality.sh < /dev/null` → `ok | 95 passed | 0 failed`,
  `[quality] All checks passed.`

## Test Plan

- Added `tests/dependency-review-workflow.test.js::"dependency-review checkout
  does not persist the workflow token (issue #127)"`, which parses the real
  workflow and asserts every `actions/checkout` step in the `dependency-review`
  job sets `persist-credentials: false`. It fails against the unfixed workflow
  and passes after the fix.
- Ran the full `./quality.sh < /dev/null` gate green; no existing test changed.
