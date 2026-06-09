# PR Summary — SCR-RUNBOOK: add SECURITY.md (issue #84)

## Summary

Added a `SECURITY.md` at the repository root to close the supply-chain
readiness gap flagged by `SCR-RUNBOOK`: the repo had no documented
security-disclosure contact and no emergency-bump procedure for responding
to a compromised dependency. The new policy names a disclosure address
(`service@stsoftware.com.au`) and sketches the Deno-native emergency-bump
steps (`deno outdated --update`, verify with `deno audit` + `./quality.sh`,
then fast-track the PR against `Develop`). Closes #84.

## Evidence

This is a documentation + test change with no web interface to screenshot.
Verification is via the new regression test suite, which parses the document
structure (top-level heading, H2 sections, disclosure email, emergency-bump
steer) rather than raw bytes, so it stays stable across reformatting. It
reuses the existing `tests/_community_docs.js` helpers established for the
CONTRIBUTING.md / CHANGELOG.md checks (issue #79).

```mermaid
flowchart LR
    A[Dependency compromise disclosed] --> B[SECURITY.md: contact service@stsoftware.com.au]
    B --> C["deno outdated --update <pkg>"]
    C --> D["Verify: deno audit + ./quality.sh"]
    D --> E[Fast-track PR against Develop]
```

Test run:

```
node --test tests/security-md.test.js
ℹ tests 6
ℹ pass 6
ℹ fail 0
```

`./quality.sh` passes cleanly (69 passed | 0 failed), and
`markdownlint-cli2 SECURITY.md` reports 0 errors.

### Deno regression avoided

The emergency-bump steer documents Deno-native tooling
(`deno outdated --update`, `deno audit`) rather than any npm/Node update
path, keeping the runbook consistent with this Deno repo.

## Test Plan

- Added `tests/security-md.test.js` (6 tests):
  - `SECURITY.md` exists at a recognised location.
  - has a top-level heading.
  - names an `@stsoftware.com.au` disclosure contact.
  - has a reporting / disclosure section.
  - documents an emergency-bump section.
  - the emergency-bump steer references `deno outdated`, `deno audit` and
    `./quality.sh`.
- Confirmed the suite fails before `SECURITY.md` is added and passes after.
- Full `./quality.sh` gate green.
