# PR Summary — Issue #137

## Summary

Closes #137.

`.github/workflows/gitleaks.yml` scanned through `gitleaks/gitleaks-action`
alone. On an organisation-owned repository that action requires a Gitleaks Pro
licence, and a Dependabot-authored pull request receives no Actions secrets at
all — so the licence arrives empty, the action exits with `ErrLicense` before
reading a single commit, and the job still reports green. That is worse than
having no gate, because the diff reads as covered while nothing scanned it.

True positive, confirmed by reading the file rather than trusting the report.
There was exactly one scanning step, no `run:` step invoking the open-source
CLI, and the licence was bound on the step itself — where no `if:` can reach it,
because `if:` is evaluated before the step runs and the `secrets` context is not
available in that expression.

The fix is the one the issue asks for. The licence now sits in the job's own
`env:` block, which every step inherits, so a step-level `if:` can branch on it.
The licensed action gained `if: env.GITLEAKS_LICENSE != ''`, and a new
open-source CLI step carries the complementary `if: env.GITLEAKS_LICENSE == ''`.
The two conditions are exhaustive and mutually exclusive, so exactly one scanner
always runs and a green job always means a scanned diff.

The fallback downloads gitleaks by pinned version — `8.30.1` — and verifies the
archive against the SHA-256 published in that release's own
`gitleaks_8.30.1_linux_x64.tar.gz` checksums entry before unpacking it. The
check uses `sha256sum --check --strict` without `--status`, so a digest mismatch
fails loudly rather than being swallowed; `set -euo pipefail` means both a
failed checksum and a gitleaks finding abort the step. The archive is unpacked
into a `mktemp -d` directory so no downloaded binary lands in the tree being
scanned, and `--exit-code 1` makes a finding fail the job rather than merely
report it. Matches are redacted so a detected secret is never echoed into the
run log.

The commit range reaches the shell through `env:`-bound `BASE_SHA` and
`HEAD_SHA` and is quoted there — never spliced into `run:` as a `${{ }}`
expression — which is the same rule Issue #159 applied to the base-ref fetch
above it (semgrep run-shell-injection).

Everything else is unchanged. `actions/checkout` keeps its pinned SHA and
version comment, the gitleaks-action pin and its `# gitleaks/gitleaks-action@v3.0.0`
annotation stay adjacent and untouched, and the `permissions`, `concurrency`
and `timeout-minutes` blocks are as they were. The token wiring the action sees
is also unchanged: job-level `env` is inherited, so its effective environment
still carries both the workflow token and the licence.

The issue also asks for a GitHub ruleset change so `Gitleaks / gitleaks` blocks
merges on the default branch and on `milestone/**`. That is repository-settings
work a human must do — the worker has no permission to alter rulesets and has
not attempted it.

## Evidence

CLI/workflow-only change — no visual surface, so no screenshot is required.

- **Version and digest resolution** — the pinned release and its checksum were
  read from the GitHub API in this run, never transcribed from memory:
  `gh api repos/gitleaks/gitleaks/releases/latest` reports `v8.30.1`, published
  `2026-03-21T02:17:58Z` (comfortably past the 24-hour supply-chain quarantine
  floor), and the release's published checksums file gives
  `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb` for
  `gitleaks_8.30.1_linux_x64.tar.gz`.
- **Red** — with the five new tests added and the workflow untouched,
  `node --test tests/gitleaks-workflow.test.js` failed five times, including
  `expected a run: step invoking the open-source gitleaks CLI` and
  `GITLEAKS_LICENSE must be bound in the job's env: — a step-level if: cannot
  read the secrets context`. The eleven pre-existing tests stayed green.
- **Green after the edit** — `node --test tests/gitleaks-workflow.test.js
  tests/action-pin-version-comments.test.js` → 22 tests, 22 passing. The
  version-comment walk still resolves the gitleaks-action tag, so gating the
  step did not break the pin annotation.
- **Full gate** — `timeout 900 ./quality.sh < /dev/null` → see the run output in
  the pull request; the semgrep stage covers the new `run:` step for shell
  injection.

## Test Plan

All new tests live in `tests/gitleaks-workflow.test.js` and assert on the parsed
workflow structure, never on its raw bytes.

- `the licence is exposed at job level so an if: can read it (issue #137)` —
  asserts the licence is bound in the job's `env:`. This is the structural
  precondition for the whole fix: bound anywhere else, neither branch condition
  is expressible at all.
- `the licensed action only runs when a licence is present (issue #137)` — the
  regression test for the reported defect. It asserts the gitleaks-action step
  carries `if: env.GITLEAKS_LICENSE != ''`, fails against the unfixed file where
  the step had no guard, and passes after the change.
- `a licence-less CLI fallback scans the diff (issue #137)` — asserts a `run:`
  step exists, carries the complementary condition, invokes `gitleaks git`, and
  passes `--exit-code 1`, `--redact` and `--log-opts`. Each flag is a behaviour
  the gate depends on: fail on a finding, never echo the secret, scan the range
  rather than all history.
- `the fallback pins the CLI version and verifies its digest (issue #137)` —
  asserts the version and digest are declared literally, that no floating
  `latest` is resolved, and that the digest is actually checked rather than
  merely recorded. It reads the step's `env:` and `run:` together, so it
  constrains the property — a pinned, verified download — without dictating
  which of the two spellings the implementation picks.
- `the fallback run: is strict-mode and injection-free (issue #137)` — asserts
  the script opens with `set -euo pipefail`, that no `${{ }}` expression is
  spliced into the shell, and that the commit range arrives through quoted
  environment variables.

One existing test changed: `gitleaks workflow wires GITHUB_TOKEN and
GITLEAKS_LICENSE via env` now asserts the *effective* environment the action
sees — the job's `env:` merged with the step's — rather than the level a
variable happens to be declared at. The wiring it guards is unchanged; only its
declaration site moved, and the test would otherwise have locked in the very
placement that made the bug unfixable. No test was commented out or removed.
