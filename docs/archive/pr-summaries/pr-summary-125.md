## Summary

Closes #125

The `audit` job's `actions/checkout` step in `.github/workflows/deno-audit.yml`
did not set `persist-credentials: false`, leaving `GITHUB_TOKEN` written to
`.git/config` where any later step in the job — a compromised dependency or an
injected script — could read it and act as the token. The job only reads
`deno.lock` to run `deno audit`; it never pushes back to the repository and
fetches no private submodules, so the credential does not need to reach disk.
Added `persist-credentials: false` under the existing checkout step's `with:`
block, leaving the pinned SHA and version comment untouched.

## Evidence

CLI/workflow-only change — no visual surface, so no screenshot is required.
`node --test tests/deno-audit-workflow.test.js` fails before the fix (missing
`persist-credentials: false`) and passes after; the full `./quality.sh`
gate (95 tests) passes.

## Test Plan

- Added `audit job checkout does not persist the workflow token (issue #125)`
  in `tests/deno-audit-workflow.test.js`, parsing the real workflow YAML and
  asserting `persist-credentials: false` on every `actions/checkout` step in
  the `audit` job. Confirmed it fails against the unfixed workflow (red) and
  passes after the fix (green).
- Ran `node --test tests/*.test.js` (95 pass, 0 fail) and the full
  `./quality.sh < /dev/null` gate — both green.
