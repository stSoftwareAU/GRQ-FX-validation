# Bump actions/setup-node in markdown-lint.yml onto the adopted v6.4.0 pin (#141)

## Summary

`.github/workflows/markdown-lint.yml` pinned `actions/setup-node` to the v4
SHA while `ci.yml` and `accessibility.yml` had already moved to v6.4.0. This
change bumps that one pin onto the same SHA the rest of the repository uses, so
`actions/setup-node` now resolves to a single commit repo-wide.

Closes #141.

```diff
-      # actions/setup-node@v4
-      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
+      # actions/setup-node@v6.4.0
+      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
```

**Why v6.4.0 and not v7.0.0.** v7.0.0 is the current latest release, but the
issue asks for the version already adopted elsewhere in the repository, and the
`action-pins` / `version-comment-drift` rules want one action to map to one SHA.
v6.4.0 is that SHA: it is byte-identical to the pin already in `ci.yml` and
`accessibility.yml`, so this lands as a single repo-wide value. Taking v7 would
instead have required editing all three workflows — including `ci.yml`, whose
comment deliberately records "setup-node v6 runs on Node 24; pin to Node 22
LTS" — which is outside this issue's scope.

**Why not v5.** The issue's catalogue row quoted `v5` as latest while its
suggested fix asked for "a SHA-pinned v6.x release matching the version already
adopted in `ci.yml`/`accessibility.yml`". Those two readings conflict; the
suggested fix is the actionable one, because v5 would be a *downgrade* from the
major this repository has already adopted.

No behaviour of the workflow itself changed: same steps, same `node-version:
"lts/*"`, same permissions, same triggers. Only the action revision the
markdownlint job resolves moved forward.

## Evidence

**Version resolved in-run, never from memory.** Both SHAs below came from the
GitHub API during this run:

```
$ gh api repos/actions/setup-node/commits/v6.4.0 --jq .sha
48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e

$ gh api repos/actions/setup-node/commits/v4 --jq .sha
49933ea5288caeca8642d1e84afbd3f7d6820020        # confirms the stale pin was v4

$ gh api repos/actions/setup-node/releases/tags/v6.4.0 --jq .published_at
2026-04-20T02:57:28Z

$ gh api repos/actions/setup-node/releases/latest --jq '.tag_name + " " + .published_at'
v7.0.0 2026-07-14T02:46:05Z
```

**Supply-chain quarantine.** v6.4.0 was published on 2026-04-20, months past the
24-hour external-dependency quarantine floor. `renovate.json` already sets a
top-level `minimumReleaseAge` of 24 hours, which covers the `github-actions`
manager, so no Renovate change is needed for this bump.

**Finding details corrected.** The issue's technical claim — that only one file
needs the fix — is correct, but two supporting details in it are not:

| Claim | Issue said | Actually |
| --- | --- | --- |
| Location of the stale pin | `markdown-lint.yml:30-31` | `markdown-lint.yml:41-42` |
| Files already on v6.4.0 | `ci.yml`, `accessibility.yml`, `sbom.yml` | `ci.yml`, `accessibility.yml` only — `sbom.yml` does not use `actions/setup-node` at all |

**Red — the new test before the workflow edit:**

```
ℹ tests 8
ℹ pass 6
ℹ fail 2
✖ no workflow pins an action to a major the repository has moved past
  actual: [ 'markdown-lint.yml:41 pins actions/setup-node@v4' ]
✖ every actions/setup-node pin names the same tag (issue #141)
  actions/setup-node annotated with 2 different tags: v6.4.0, v4
```

**Green — after the workflow edit, across every workflow-pin test in the repo:**

```
$ node --test tests/action-major-consistency.test.js tests/markdown-lint-workflow.test.js \
    tests/action-pin-version-comments.test.js tests/checkout-node-runtime.test.js \
    tests/ci-workflow.test.js tests/accessibility-workflow.test.js
ℹ tests 52
ℹ pass 52
ℹ fail 0
```

This is a CI-configuration change with no web interface, so no screenshots
apply; the evidence is the resolved SHAs above and the test runs.

## Test Plan

New file `tests/action-major-consistency.test.js` (8 tests). It derives, per
action, the highest major the repository annotates anywhere, then flags any pin
of that same action left on a lower major — so the rule catches a future
straggler without naming an action or a version.

- `annotations reads every action version comment` — parses `# owner/repo@tag`
  lines into `{ action, tag, line }`.
- `annotations returns nothing for text that carries none` — empty string,
  `undefined`, and a prose comment containing an `@`.
- `taggedMajor reads the major from a version tag` — `v4`, `v6.4.0`,
  `v11.0.0-beta.1`, and null for `main`, a bare SHA, `undefined`.
- `staleMajorPins flags a pin left behind the adopted major` — the #141 shape,
  on synthetic records.
- `staleMajorPins ignores refs that make no version claim` — a branch ref is
  never reported as stale.
- `staleMajorPins is empty when an action is pinned consistently`.
- `no workflow pins an action to a major the repository has moved past` — the
  repo-level guard, over every file in `.github/workflows/`.
- `every actions/setup-node pin names the same tag (issue #141)` — the direct
  regression assertion for this issue.

**Raw-text exception.** Repo convention (issue #42) is to assert on the parsed
workflow object rather than its text. Version comments are comments, so the YAML
parser cannot see them at all — a SHA names no version, and the annotation is
the only in-repo record of which major a pin ships. These tests therefore scan
raw text by necessity, and the header comment in the file says so. The
assertions on the parsed object in `markdown-lint-workflow.test.js` still cover
the step itself.

**Regression linkage.** `tests/action-major-consistency.test.js::no workflow
pins an action to a major the repository has moved past` and `::every
actions/setup-node pin names the same tag (issue #141)` both fail against the
unfixed workflow (see the Red block) and pass after the bump.

**Full quality gate** — run once, in the foreground:

```
$ ./quality.sh < /dev/null
[quality] Node.js test suite (tests/*.test.js)
ℹ tests 325
ℹ pass 325
ℹ fail 0
[quality] Deno test suite (tests/*.test.ts)
ok | 95 passed | 0 failed (284ms)
[quality] All checks passed.
```

**Not changed.** `tests/checkout-node-runtime.test.js` and
`tests/action-pin-version-comments.test.js` both contain `actions/setup-node`
strings inside synthetic YAML fixtures. Those are test inputs, not repository
pins, so they are deliberately left as they are — rewriting them would weaken
the cases they exercise.

No existing test was changed, commented out, or removed.
