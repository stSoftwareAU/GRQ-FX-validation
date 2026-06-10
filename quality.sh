#!/usr/bin/env bash
# Quality gate for GRQ FX Validation Dashboard.
#
# Issue #30: a regression slipped through to the live site
# ("Failed to load prediction data") because the existing test suite was
# never executed in CI and several assertions silently misbehaved due to
# JavaScript string-escape bugs. This script collects every required
# check into a single entry point so the CI pipeline (and contributors)
# can run them with one command.
#
# Usage:
#   ./quality.sh         # run all checks
#
# Exits non-zero on the first failure. Designed to be called as
# `./quality.sh < /dev/null` from unattended workers.

set -euo pipefail

cd "$(dirname "$0")"

echo "[quality] Node.js test suite (tests/*.test.js)"
node --test tests/*.test.js

# Issue #104: in CI the Deno suite is the canonical gate of
# deno-quality.yml, which exercises tests/*.test.ts with coverage and
# uploads to Codecov on every PR. Running the same suite again here
# doubled the runner minutes for it on every Develop PR and split its
# source of truth across two files. GitHub Actions exports CI=true, so
# skip the Deno block there and let deno-quality.yml own it. Contributors
# running quality.sh off-CI still execute the full Deno suite locally.
if [ -n "${CI:-}" ]; then
  echo "[quality] Skipping Deno test suite in CI; deno-quality.yml gates it with coverage (issue #104)"
elif command -v deno >/dev/null 2>&1; then
  echo "[quality] Deno test suite (tests/*.test.ts)"
  # Issue #57: --frozen makes deno.lock drift a CI failure so URL
  # imports (helpers/server.ts, tests/*.test.ts) are integrity-pinned.
  # Without it the build silently re-fetches std modules and a hijack
  # of deno.land/std could swap implementation bytes between runs.
  deno test --frozen --allow-read --allow-net=127.0.0.1 tests/*.test.ts
else
  echo "[quality] WARNING: Deno not installed, skipping tests/*.test.ts" >&2
fi

echo "[quality] All checks passed."
