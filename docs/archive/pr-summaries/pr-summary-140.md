# Pin actions/checkout to a supported Actions runtime (#140)

## Summary

Closes #140.

Every SHA-pinned `actions/checkout` in `.github/workflows/` that still resolved
to a v4.x major has been bumped to `v6.0.2`, keeping the SHA pin and updating
the trailing version comment. v4.x ships the **node20** Actions runner, which
GitHub force-upgraded on 2026-06-02 and removed on 2026-09-16; v6 is the first
major published on **node24**. A 40-hex SHA names no runtime, so the pin looked
healthy while the runner underneath it was already gone.

Each of the nine workflows changed by exactly two lines:

```yaml
      # actions/checkout@v6.0.2
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
```

`de0fac2e…` is the SHA `ci.yml`, `accessibility.yml` and `sbom.yml` already
used, so `actions/checkout` is now pinned to a single SHA repo-wide — which is
also what keeps the `action-pins` and `version-comment-drift` checks green.

This is not the "pin behind the catalogue's latest major" finding (check 16).
v4 remains a recorded major; the defect is the runtime it ships on. The latest
release is `v7.0.1`, deliberately **not** taken — v6.0.2 is what the issue's
suggested fix names, it is the SHA already present in this repo, and bumping to
the newest major is a separate finding this issue explicitly excludes.

No behaviour of the workflows themselves changed: same steps, same permissions,
same triggers, same `persist-credentials` settings.

## Evidence

**Version resolved in-run, never from memory.**

```text
$ gh api repos/actions/checkout/commits/v6.0.2 --jq .sha
de0fac2e4500dabe0009e67214ff5f5447ce83dd

$ gh api repos/actions/checkout/releases/tags/v6.0.2 --jq '.tag_name + " published " + .published_at'
v6.0.2 published 2026-01-09T19:53:28Z
```

Published 2026-01-09, roughly eight months old — far past the 24-hour external
quarantine floor (`VIBE_BUMP_QUARANTINE_HOURS`), so no wait applies.

**Finding line numbers and tags corrected.** Every anchor in the issue was
stale — earlier milestone PRs shifted the lines — and two of the recorded tags
were wrong. The actual pre-fix state was:

| File | Issue said | Actually at | Actual tag |
| --- | --- | --- | --- |
| `actionlint.yml` | *(not listed)* | 45 | `v4.3.1` |
| `deno-audit.yml` | 52 | 51 | `v4.3.1` |
| `deno-outdated.yml` | 40 | 39 | `v4.3.1` |
| `deno-quality.yml` | 33 | 36 | `v4.3.1` |
| `dependency-review.yml` | 29 | 31 | `v4.3.1` |
| `gitleaks.yml` | 32 | 45 | `v4.2.2` |
| `markdown-lint.yml` | 29 | 31 | `v4.3.1` |
| `semgrep.yml` | 32 | 34 | `v4.3.1` |
| `shellcheck.yml` | 28 | 30 | `v4.3.1` |

**Nine files, not eight.** `actionlint.yml` carried the same node20-era pin but
is absent from the issue's list. It is fixed here because the property being
enforced is general — *no workflow pins a node20-era checkout* — not a set of
per-line patches. Leaving it behind would have left one workflow failing for
exactly the reason the issue was raised, and would have kept `actions/checkout`
split across two SHAs.

**Red** — `tests/checkout-node-runtime.test.js` written first, against the
unfixed tree:

```text
✖ no workflow pins actions/checkout to a deprecated-runtime major
    actionlint.yml:45 pins actions/checkout@v4.3.1
    deno-audit.yml:51 pins actions/checkout@v4.3.1
    deno-outdated.yml:39 pins actions/checkout@v4.3.1
    deno-quality.yml:36 pins actions/checkout@v4.3.1
    dependency-review.yml:31 pins actions/checkout@v4.3.1
    gitleaks.yml:45 pins actions/checkout@v4.2.2
    markdown-lint.yml:31 pins actions/checkout@v4.3.1
    semgrep.yml:34 pins actions/checkout@v4.3.1
    shellcheck.yml:30 pins actions/checkout@v4.3.1
✖ every workflow pins actions/checkout to the same SHA
    actions/checkout pinned to 3 different SHAs:
    de0fac2e (accessibility, ci ×4, sbom), 34e11487 (8 files), 11bd7190 (gitleaks)
```

**Green** — after the bump:

```text
$ node --test tests/checkout-node-runtime.test.js tests/action-pin-version-comments.test.js
ℹ tests 12
ℹ pass 12
ℹ fail 0
```

The two pre-existing drift assertions in
`tests/action-pin-version-comments.test.js` stayed green throughout, confirming
the new SHA carries one version comment and no action/tag pair maps to two SHAs.

**Full gate** — recorded below in the Test Plan.

This is a CI-configuration change with no web interface, so no screenshots
apply; the evidence is the resolved SHA, the red-to-green test run and the gate.

## Test Plan

- **New** `tests/checkout-node-runtime.test.js` — six behavioural tests that
  call real exported functions with test data and assert on returned values:
  - `taggedMajor` reads the major from `v4`, `v4.2.2`, `v6.0.2`,
    `v11.0.0-beta.1`, and returns `null` for `main`, a bare SHA, `version4`,
    `""` and `undefined` (refs that carry no runtime claim).
  - `annotationsFor` collects only the requested action's `# owner/repo@tag`
    comments, with line numbers, ignoring other actions' annotations.
  - `deprecatedRuntimeAnnotations` flags majors below the supported floor and
    leaves non-version refs alone.
  - Two repository-level regressions: no workflow annotates `actions/checkout`
    below v6, and every workflow pins it to the same SHA (this one reads the
    **parsed** YAML via `collectActionRefs`/`loadWorkflow`).

  The annotation tests read raw workflow text rather than the parsed object
  because comments are invisible to a YAML parser — the same justified
  exception `tests/action-pin-version-comments.test.js` already makes. No test
  greps source code for implementation patterns; each one calls a function and
  checks its result.

- **Regression linkage:** the two repository-level tests fail against the
  unfixed tree (output quoted under Evidence) and pass after the bump.

- **Full quality gate:**

  ```text
  $ ./quality.sh < /dev/null
  [quality] Node.js test suite (tests/*.test.js)
  ℹ tests 317
  ℹ pass 317
  ℹ fail 0
  [quality] Deno test suite (tests/*.test.ts)
  ok | 95 passed | 0 failed (308ms)
  [quality] All checks passed.
  ```

- **Not changed:** `tests/action-pin-version-comments.test.js` lines 75–111 and
  `tests/workflow-yaml-parser.test.js` lines 38/43/155 still contain `v4` /
  `34e11487…` / `11bd7190…` strings. Those are synthetic parser fixtures, not
  assertions about this repository's workflows, so editing them would have
  weakened the tests without fixing anything.

No existing test was changed, commented out, or removed.
