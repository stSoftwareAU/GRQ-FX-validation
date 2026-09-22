# PR Summary — Issue #136

## Summary

Closes #136.

`.github/workflows/gitleaks.yml` pinned `gitleaks/gitleaks-action` to
`ff98106e4c7b2bc287b24eaf42907196329070c7` — an immutable SHA, but a frozen
one. It resolves to `v2.3.9`, which runs on the Node 20 Actions runtime GitHub
removed from hosted runners on 16 September 2026. The file therefore passed
every presence and pin-shape check while the scan it runs had drifted away from
the ref the fleet emits today, which is exactly the failure mode the finding
describes: a green gate that is no longer scanning.

True positive, confirmed by reading the file rather than trusting the report —
line 53 carried the stale pin under a `# gitleaks/gitleaks-action@v2.3.9`
comment. The pin now reads
`gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e` with its
trailing comment moved to `v3.0.0` in the same edit, so the annotation and the
SHA cannot disagree. No `best-practice-ignore` suppression is warranted.

The SHA was not taken from the issue body or written from memory. It was
resolved in this run with
`gh api repos/gitleaks/gitleaks-action/tags --jq '.[] | .name + " " + .commit.sha'`,
which reports `v3.0.0 e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e`. The v3.0.0
release notes state the change is runtime-only — Node 20 to Node 24, with no
change to inputs, outputs or behaviour — so the existing `GITHUB_TOKEN` and
`GITLEAKS_LICENSE` env wiring carries over untouched. The release was published
on 30 May 2026, comfortably past the 24-hour supply-chain quarantine floor.

Everything else in the workflow is unchanged: `actions/checkout` keeps its own
pinned SHA and version comment, `fetch-depth: 0` and the `env:`-bound base-ref
fetch stay as they are, and the `permissions`, `concurrency` and
`timeout-minutes` blocks are untouched.

The issue also asks for a GitHub ruleset change so `Gitleaks / gitleaks` blocks
merges on the default branch and on `milestone/**`. That is repository-settings
work a human must do — the worker has no permission to alter rulesets and has
not attempted it.

## Evidence

CLI/workflow-only change — no visual surface, so no screenshot is required.

- **SHA resolution** — `gh api repos/gitleaks/gitleaks-action/tags` →
  `v3.0.0 e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e`,
  `v2.3.9 ff98106e4c7b2bc287b24eaf42907196329070c7`. The pinned value was read
  from the API in this run, never transcribed from the issue.
- **Red** — with the two new tests added and the workflow untouched,
  `node --test tests/gitleaks-workflow.test.js` failed with
  `gitleaks-action must be pinned to v3.0.0 (e0c47f4f…), saw 'ff98106e…'`.
- **Green after the edit** — `node --test tests/gitleaks-workflow.test.js
  tests/action-pin-version-comments.test.js` → 17 tests, 17 passing. The
  repository-wide version-comment-drift checks pass, so no other workflow
  annotates a conflicting tag.
- **Full gate** — `timeout 900 ./quality.sh < /dev/null` →
  `ok | 95 passed | 0 failed` and `[quality] All checks passed.`

## Test Plan

Both new tests live in `tests/gitleaks-workflow.test.js` and parse the workflow
rather than pattern-matching its bytes.

- `gitleaks-action is pinned to the canonical SHA (issue #136)` — loads the
  workflow through the shared parser, pulls the `gitleaks/gitleaks-action`
  reference out of `collectActionRefs`, and asserts the pinned value equals the
  resolved v3.0.0 SHA. This is the regression test: the existing pin assertion
  only checked for 40 hex characters, which any stale SHA satisfies, so it
  stayed green throughout the drift. The new one fails against the unfixed file
  and passes after the re-pin.
- `gitleaks-action version comment tracks the pin (issue #136)` — locates the
  canonical pin in the file, asserts the line above it annotates the same
  action, and asserts the annotated tag is both the expected `v3.0.0` and a
  major of 3 or newer. The major check is the general rule, not a fixture lock:
  any future pin annotated `v2.x` names a runtime GitHub no longer provides and
  fails regardless of which SHA it carries.

No existing test was changed, commented out, or removed.
