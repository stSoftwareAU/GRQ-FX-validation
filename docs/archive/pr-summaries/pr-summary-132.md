# PR Summary — Issue #132

## Summary

Closes #132.

A milestone is delivered as a run of sub-issue PRs into a shared
`milestone/<name>` branch, with a single rollup PR later merging that branch
into the default branch. The Deno Quality workflow triggered on
`pull_request` with a branch filter of `["*"]`, and GitHub's single-level `*`
glob stops at a `/` — so the filter selected `main` and `Develop` but none of
the `milestone/<name>` branches. Every milestone sub-issue PR therefore merged
with `deno lint`, `deno fmt --check`, `deno check` and the Deno test run
silently skipped, and any breakage they introduced surfaced once, late, on the
rollup PR where it is hardest to attribute.

This is a true positive. The workflow really did carry a filter that no
milestone branch can match, and the repo has already accepted the same finding
elsewhere — `shellcheck.yml` carries the identical `milestone/*` entry from
Issue #144. No `best-practice-ignore` suppression is warranted.

The change adds `milestone/*` alongside the existing `*` entry in the
`pull_request` branch filter, with a comment naming Issue #132 and the glob
semantics behind it. Milestone names are a single slug with no nested slashes,
so the single-level glob suffices. Every pinned action SHA and its version
comment are untouched, as are the job's permissions, concurrency block,
timeout and the Issue #126 credential setting.

## Evidence

CLI/workflow-only change — no visual surface, so no screenshot is required.

- **Red** — `node --test tests/deno-quality-workflow.test.js` before the edit:
  12 passing, 1 failing with
  `pull_request.branches must select milestone/scan-20260910, got ["*"]`.
- **Green after the edit** — the same command: 13 tests, 13 passing, 0 failing.
- **Full gate** — `./quality.sh < /dev/null` passed.

## Test Plan

Added two tests to `tests/deno-quality-workflow.test.js`:

- `deno-quality runs on PRs into milestone branches (issue #132)` — the
  regression test. It fails against the unfixed workflow and passes after the
  fix.
- `deno-quality still runs on ordinary PR target branches` — guards the other
  direction, so a future edit cannot fix milestone coverage by dropping `main`,
  `master` or `Develop`.

Both parse the real workflow through `tests/_workflow-yaml.js` and evaluate the
filter with `branchMatchesFilters`, which implements GitHub's own glob
semantics. They assert on the branches the filter actually selects, not on its
literal text, so a reformat cannot break them while a real regression still
trips them.

No existing test was changed, commented out, or removed.
