# Pin the CI install of markdownlint-cli2 to an exact version

## Summary

Closes #138.

`.github/workflows/markdown-lint.yml` installed its linter with a floating
`npm install -g markdownlint-cli2`, so every CI run resolved whatever the
registry served at that moment. A hijacked release would have executed on the
runner — which holds `GITHUB_TOKEN` — the instant it was published, with no
embargo at all.

Renovate's `minimumReleaseAge` quarantine could not help: it only covers
manifests a manager can read, and a workflow `run:` block is not a manifest.
SHA-pinning does not reach it either — that scanner only inspects `uses:`.

Two changes close the gap:

- **`.github/workflows/markdown-lint.yml`** — the install now names an exact
  version, `markdownlint-cli2@0.23.3`, matching the house precedent already set
  by `npm install -g pa11y-ci@3.1.0` in `accessibility.yml` (comment between
  `- name:` and `run:`).
- **`renovate.json`** — a third `customManagers` entry whose file pattern covers
  `.github/workflows/*.yml` and whose `matchStrings` capture `depName` and
  `currentValue` from an `npm install <pkg>@<version>` line, resolved against the
  npm datasource. Without it the new pin would sit un-refreshed forever; with it
  Renovate keeps the pin current *inside* the 24-hour quarantine window. The
  entry also picks up the existing `pa11y-ci@3.1.0` pin.

`--ignore-scripts` was deliberately **not** added: the issue calls that a
separate per-package judgement (some packages, `pa11y-ci` among them, need their
postinstall step), and pinning is the fix being asked for here.

No new Node tooling is introduced — the `npm install -g` line already existed;
only its version specifier changed.

## Evidence

**Version resolved in-run, not from memory.** `markdownlint-cli2@0.23.3` was
read from the npm registry during this run: published `2026-09-20T04:44:38.259Z`,
making it 61.0 hours old at the time of the change — comfortably past the
24-hour external-dependency quarantine floor. The `@1.2.3` in the issue text is
an illustrative example, not a real release.

**Finding line number corrected.** The report points at
`.github/workflows/markdown-lint.yml:24`, which is `runs-on: ubuntu-latest`. The
actual unpinned install was line 46. The finding is a true positive; only its
anchor was off.

**Red.** With the tests added and no implementation, exactly the three new tests
failed and nothing else:

```
✖ every npm install in the workflow pins an exact version (issue #138)
✖ renovate.json includes a custom manager covering .github/workflows
✖ the workflow custom manager extracts the pinned npm install
```

**Green.** After both edits:

```
$ timeout 300 node --test tests/markdown-lint-workflow.test.js tests/renovate-quarantine.test.js < /dev/null
ℹ tests 23
ℹ pass 23
ℹ fail 0
```

**Full gate.**

```
$ timeout 900 ./quality.sh < /dev/null
ok | 95 passed | 0 failed (292ms)
[quality] All checks passed.
```

## Test Plan

Three new behavioural tests, all asserting on parsed structures and real files
rather than grepping source text.

`tests/markdown-lint-workflow.test.js`:

- **`every npm install in the workflow pins an exact version (issue #138)`** —
  parses the workflow, walks *every* `run:` step in the `markdownlint` job,
  extracts the package specs named by any `npm install`/`i`/`add` (dropping
  flags, stopping at a shell separator) and asserts each one carries an exact
  `MAJOR.MINOR.PATCH` version. It splits on the *last* `@` so a scoped package
  is handled correctly. Because it asserts the general property across the whole
  job rather than the `markdownlint-cli2` spelling alone, a future unpinned
  install added to this workflow fails too.

`tests/renovate-quarantine.test.js`:

- **`renovate.json includes a custom manager covering .github/workflows`** —
  finds the manager by compiling each declared file pattern and testing it
  against the real workflow path, then asserts it resolves from the npm
  datasource. Finding the entry by behaviour rather than by index means
  reordering `customManagers` cannot break it.
- **`the workflow custom manager extracts the pinned npm install`** — compiles
  the manager's own `matchStrings` and runs them over the real
  `markdown-lint.yml`, asserting the capture groups actually yield
  `depName: markdownlint-cli2` and an exact `currentValue`. This exercises the
  regex against production content instead of merely asserting the config key
  exists, so a manager that is present but non-matching still fails.

The pre-existing `workflow installs and runs markdownlint-cli2` test matches
`/npm install -g markdownlint-cli2/`, which the pinned `…@0.23.3` line still
satisfies, so it stays green unchanged.

No existing test was changed, commented out, or removed.
