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

if command -v deno >/dev/null 2>&1; then
  echo "[quality] Deno test suite (tests/*.test.ts)"
  deno test --allow-read --allow-net=127.0.0.1 tests/*.test.ts
else
  echo "[quality] WARNING: Deno not installed, skipping tests/*.test.ts" >&2
fi

echo "[quality] All checks passed."
