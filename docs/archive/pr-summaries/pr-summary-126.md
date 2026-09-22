## Summary

Closes #126

The `quality` job's `actions/checkout` step in
`.github/workflows/deno-quality.yml` did not set `persist-credentials: false`,
leaving `GITHUB_TOKEN` written to `.git/config` as an auth header where any
later step in the job — a compromised dependency or an injected script — could
read it and act as the token. The job only reads the checked-out tree to run
`deno lint`, `deno fmt --check`, `deno check`, `deno test` and upload coverage
to Codecov; it never pushes back to the repository and fetches no private
submodules, so the credential does not need to reach disk. Added
`persist-credentials: false` under the checkout step's `with:` block, leaving
the pinned SHA and its version comment untouched.

## Evidence

CLI/workflow-only change — no visual surface, so no screenshot is required.
`node --test tests/deno-quality-workflow.test.js` fails before the fix
(`persist-credentials` is `undefined`, expected `false`) and passes after; the
full `./quality.sh < /dev/null` gate passes (294 Node tests, 95 Deno tests, 0
failures).

## Test Plan

- Added `quality job checkout does not persist the workflow token (issue #126)`
  in `tests/deno-quality-workflow.test.js`, parsing the real workflow YAML and
  asserting `persist-credentials: false` on every `actions/checkout` step in the
  `quality` job. Confirmed it fails against the unfixed workflow (red) and
  passes after the fix (green).
- Ran `node --test tests/*.test.js` (294 pass, 0 fail) and the full
  `./quality.sh < /dev/null` gate — both green.
