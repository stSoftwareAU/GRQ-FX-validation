# PR Summary — Issue #57

## Summary

Integrity-pin the HTTPS Deno standard library imports used by
`helpers/server.ts` and the `tests/*.test.ts` suite by committing a
`deno.lock` and switching the CI test step to `--frozen`. Closes #57.

Previously the repository pinned the std version (`@0.208.0`) in URL
form but had no lockfile, so the integrity guarantee depended entirely
on whatever bytes `deno.land/std` happened to serve at run time. With
Renovate already configured to bump `denoland/deno_std` automatically,
this is the exact "version-pinned but not integrity-pinned" gap that
the Shai-Hulud / Axios / node-ipc class of supply-chain incidents
relied on. Committing `deno.lock` and running the suite under
`deno test --frozen` makes any drift between the imported URLs and
their SHA-256 hashes a CI failure rather than a silent re-fetch.

A minimal `deno.json` is included so the lockfile (and any future
compiler options) has a canonical home and editor tooling picks up
the same configuration as the CLI.

## Changes

- **`deno.json`** (new): minimal configuration enabling lockfile
  auto-discovery.
- **`deno.lock`** (new, 114 entries): SHA-256 integrity hashes for
  every `https://deno.land/std@0.208.0/...` URL pulled in by
  `helpers/server.ts` and the two TypeScript test files that import
  the std `assert` and `path` modules.
- **`quality.sh`**: the Deno test invocation now passes `--frozen`
  so an out-of-date lockfile fails the CI gate instead of being
  silently refreshed.
- **`tests/deno-lock-integrity.test.js`** (new): four regression
  tests covering the integrity floor.

## Evidence

Backend / CLI change with no web interface to screenshot. Evidence is
the green test run.

```mermaid
flowchart LR
    A[helpers/server.ts<br/>tests/*.test.ts] -->|imports| B[deno.land/std@0.208.0/...]
    B -->|SHA-256 hashes| C[deno.lock]
    C -->|--frozen check| D[quality.sh / CI]
    D -->|mismatch &rarr; FAIL| E[Supply-chain<br/>tamper detected]
```

### Lockfile drift detection in action

`deno test --frozen` exits non-zero if any cached URL hash differs
from `deno.lock`. The four-test regression suite in
`tests/deno-lock-integrity.test.js` covers:

1. `deno.lock` exists at the repo root.
2. The lockfile parses as JSON and every `remote` entry maps an
   `https://` URL to a 64-char hex SHA-256.
3. Every `https://deno.land/std@.../...` URL discovered in
   `helpers/server.ts` and `tests/*.test.ts` is pinned in
   `deno.lock` (so a future copy-paste of a fresh std import that
   forgets to refresh the lockfile is caught).
4. `quality.sh`'s `deno test` invocation passes `--frozen`.

Full quality run output:

```
[quality] Node.js test suite (tests/*.test.js)
…
ℹ tests …
ℹ pass …
ℹ fail 0
[quality] Deno test suite (tests/*.test.ts)
…
ok | 44 passed | 0 failed
[quality] All checks passed.
```

## Test Plan

- Added `tests/deno-lock-integrity.test.js` with four assertions
  (lockfile exists, lockfile is valid JSON with SHA-256 hashes,
  every project std import is pinned, `quality.sh` uses `--frozen`).
- Existing Node and Deno suites continue to pass under `--frozen`
  (44/44 Deno tests green; Node suite unchanged).
- Verified locally with `./quality.sh < /dev/null`.

## Deno regression avoided

This change adds a minimal `deno.json` and `deno.lock` to a Deno
repo rather than introducing any Node-only lock equivalent or build
step. The Node test runner already in `quality.sh` is unchanged; no
new Node tooling, `package.json`, or `node_modules` was added.
