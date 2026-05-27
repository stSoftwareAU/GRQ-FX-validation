## Summary

Added an explicit `timeout-minutes:` field to every job across
`.github/workflows/` so a wedged step can no longer hold a runner for
GitHub's 360-minute default. Caps are tuned per job — tight for
lint/scan jobs (5–10 minutes), generous for SAST and the quality gate
(15 / 20 minutes). Closes #39.

## Evidence

This is a CI-only configuration change with no UI surface, so evidence
is the new regression test plus a clean `quality.sh` run.

- New test: `tests/workflow-timeout-minutes.test.js` parses every
  workflow under `.github/workflows/`, walks each job, and asserts that
  a four-space-indented `timeout-minutes:` is present with a value in
  `[1, 60]`. The test failed against the unfixed workflows and now
  passes against the patched set.
- `./quality.sh < /dev/null` passes locally — Node test suite reports
  `36 passed | 0 failed`, including the six new per-workflow checks.

Per-job caps applied:

| Workflow | Job | timeout-minutes |
| --- | --- | --- |
| ci.yml | check-changes | 5 |
| ci.yml | quality | 20 |
| ci.yml | deploy-pages | 10 |
| dependency-review.yml | dependency-review | 5 |
| gitleaks.yml | gitleaks | 10 |
| markdown-lint.yml | markdownlint | 10 |
| semgrep.yml | semgrep | 15 |
| shellcheck.yml | shellcheck | 5 |

## Test Plan

- Added `tests/workflow-timeout-minutes.test.js` covering every
  workflow listed in the issue. Parses YAML by indentation and checks
  for a job-level `timeout-minutes:` in the safe `[1, 60]` range.
- Ran `node --test tests/workflow-timeout-minutes.test.js` to confirm
  failure pre-fix and success post-fix.
- Ran `./quality.sh < /dev/null` end-to-end to confirm the full Node +
  Deno suite still passes.
