# PR Summary — Issue #149

## Summary

Removed the committed `.vibe_default_branch` (it read `Develop`) from the tree.
It was the Vibe Coder worker's per-clone cache of the default branch; since
stSoftwareAU/VibeCoder#1652 the worker keeps that cache inside the clone's git
directory (`.git/vibe/default_branch`) and never reads or writes the in-tree
copy, so the tracked file was dead weight — and a hidden file the repository's
own policy says must not be checked in. Added a regression test so it cannot
come back. Closes #149.

## Evidence

Backend/repository-hygiene change — no web interface to screenshot. Verified
with real git behaviour instead:

- `git ls-files | grep vibe` now returns nothing (the file was the only match).
- `tests/vibe-default-branch-untracked.test.js` failed against the tracked file
  (`worker default-branch cache must not be tracked: .vibe_default_branch`) and
  passes after `git rm .vibe_default_branch`.
- `./quality.sh < /dev/null` → `[quality] All checks passed.` (Node suite plus
  95 Deno tests).

No other file references `.vibe_default_branch` — a repository-wide grep found
zero occurrences — so nothing else needed changing.

## Test Plan

- Added `tests/vibe-default-branch-untracked.test.js` — asserts no tracked path
  is `.vibe_default_branch`, using `git ls-files` (mirrors the existing
  `tests/heartbeat-gitignore.test.js` pattern from issue #89).
- Ran the full quality gate: all checks pass.
