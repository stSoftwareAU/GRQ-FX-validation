# PR Summary — Issue #131

## Summary

Closes #131.

`actions/checkout` defaults to persisting credentials, writing the workflow's
`GITHUB_TOKEN` into `.git/config` as an extra-header auth entry. Every later
step in the same job can read that file and act as the token, so a compromised
dependency or an injected script inherits the workflow's write access to the
repository for the life of the job.

The `shellcheck` job is a true positive. Its only work after the checkout is
handing the tree to the third-party `ludeeus/action-shellcheck`, which reads
the scripts and reports findings. Nothing in the job pushes a commit, creates a
tag, publishes a release asset or fetches a private submodule, and the
repository is public, so no credential is needed to read the tree in the first
place. No `best-practice-ignore` suppression is warranted.

The change adds `persist-credentials: false` to the checkout step in
`.github/workflows/shellcheck.yml` with an Issue-numbered rationale comment.
The pinned `actions/checkout` and `ludeeus/action-shellcheck` commit SHAs and
their version comments are untouched.

## Evidence

CLI/workflow-only change — no visual surface, so no screenshot is required.

- **Red:** `node --test tests/shellcheck-workflow.test.js` failed before the
  edit — `shellcheck actions/checkout must set persist-credentials: false`,
  actual `undefined`, expected `false`.
- **Green after the edit:** same command, `pass 9 / fail 0`.
- **Full gate:** `./quality.sh < /dev/null` finished with
  `ok | 95 passed | 0 failed` and `[quality] All checks passed.`

## Test Plan

Added `tests/shellcheck-workflow.test.js` →
`shellcheck checkout does not persist the workflow token (issue #131)`. It
parses the real workflow through `loadWorkflow()`, selects every
`actions/checkout` step in the `shellcheck` job, and asserts each one sets
`with.persist-credentials` to `false` — a structured parse of the committed
YAML, not a text match, so reformatting the file cannot make it pass falsely.
It fails against the unfixed workflow and passes after the fix.

No existing test was changed, commented out, or removed.
