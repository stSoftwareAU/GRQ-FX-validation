# Add `set -euo pipefail` to the `Check for changes` bash block in ci.yml

## Summary

Hardened the multi-line bash block in the `Check for changes` step of
`.github/workflows/ci.yml` by adding `set -euo pipefail` as the first
command of the `run:` block and declaring `shell: bash` explicitly.

Without `set -e` an interim `git diff` failure (e.g. against a missing
parent commit after a force-push) silently produced an empty
`changed_files.txt`, and the downstream `docs-changed` output reported
`false`. The Pages-deploy gate then made the wrong decision. `-u`
catches typos in `${VAR}` references and `-o pipefail` makes piped
failures observable. `shell: bash` is implicit on `ubuntu-latest`
runners but stating it explicitly is the documented hardening pattern.

Closes #41.

## Evidence

Backend / CI-only change — no UI to screenshot. Verified via the
`ci-workflow.test.js` regression test (added alongside this change)
and the full quality gate.

The hardened step now looks like this:

```yaml
- name: Check for changes
  id: filter
  shell: bash
  run: |
    set -euo pipefail
    # Get list of changed files
    ...
```

## Test Plan

- Added `ci workflow 'Check for changes' step hardens bash with set -euo pipefail (issue #41)` to `tests/ci-workflow.test.js`. The test:
  - Locates the `Check for changes` step in `ci.yml`.
  - Asserts the step declares `shell: bash`.
  - Asserts the first non-blank, non-comment command of the `run: |` block is exactly `set -euo pipefail`.
- Verified the test fails against the pre-fix workflow and passes after the fix.
- `./quality.sh < /dev/null` passes cleanly (36 tests, 0 failures).
