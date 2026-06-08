# Add CODEOWNERS coverage for `.github/workflows/`

## Summary

The repository ships privileged GitHub Actions workflows but had **no
`CODEOWNERS` file** in any location GitHub recognises, so
`.github/workflows/` had no required reviewer. A compromised or
self-approving account could quietly edit a workflow that then runs with
`id-token: write` (OIDC) and repository secrets — the 2025–2026
tj-actions OIDC-theft pattern.

This PR adds `.github/CODEOWNERS` assigning `@stSoftwareAU/maintainers`
as the required code owner for the privileged configuration:

- `/.github/workflows/` — all workflow definitions
- `/.github/actions/` — composite action definitions
- `/.github/CODEOWNERS` — the policy itself cannot be weakened without
  owner review

The privileged surface this protects:

| Workflow | Privilege |
| --- | --- |
| `ci.yml` | `id-token: write` → deploys to live GitHub Pages |
| `deno-quality.yml` | `secrets.CODECOV_TOKEN` |
| `semgrep.yml` | `secrets.SEMGREP_APP_TOKEN` |
| `gitleaks.yml` | `secrets.GITLEAKS_LICENSE` |
| `deno-outdated.yml` | `peter-evans/create-pull-request` token |

Closes #75.

## Manual follow-up (repo admin — not statically applyable)

The CODEOWNERS file only becomes enforcing once branch protection
requires code-owner review. These are repo-level settings that require
admin access and cannot be committed to the tree, so a maintainer must
enable them on the `Develop` default branch (via branch protection or a
ruleset):

- require at least one PR approval before merge, with **Require review
  from Code Owners** enabled;
- block direct push and force-push to `Develop`;
- require linear history if the team squash/rebase merges.

```mermaid
flowchart LR
    PR[PR edits .github/workflows/] --> CO{CODEOWNERS rule}
    CO -->|owner review required| MAINT[@stSoftwareAU/maintainers approves]
    MAINT --> MERGE[Merge allowed]
    CO -.->|no owner approval| BLOCK[Merge blocked]
```

## Evidence

Backend/config change — no web interface to screenshot. Verified via the
test suite: `./quality.sh` passes (`69 passed | 0 failed`), including the
12 new CODEOWNERS tests.

The tests assert on **parsed matching behaviour** (via
`tests/_codeowners.js`), not raw file text, so reformatting the file does
not break them:

- file exists in a recognised location;
- every workflow file under `.github/workflows/` resolves to a code owner;
- `.github/actions/` definitions resolve to a code owner;
- every declared owner is a valid `@user` or `@org/team` handle;
- parser/matcher unit tests over synthetic CODEOWNERS data (comments,
  multiple owners, inline comments, last-match-wins precedence, anchored
  directory patterns, unanchored bare names).

## Test Plan

- Added `tests/_codeowners.js` — CODEOWNERS parser + GitHub-semantics
  matcher (`parseCodeowners`, `ownersFor`, `matchesPattern`,
  `codeownersPath`).
- Added `tests/codeowners.test.js` — 12 tests covering the actual file
  and synthetic data. These fail against the pre-fix tree (no CODEOWNERS)
  and pass after adding `.github/CODEOWNERS`.
- `./quality.sh < /dev/null` → all checks pass.
