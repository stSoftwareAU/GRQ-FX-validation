## Summary

Corrected the `actions/checkout` version comments in `.github/workflows/` so one
pinned SHA carries one version comment, clearing every `version-comment-drift`
finding carried over on the baseline tracker. Closes #150.

Both SHAs were re-resolved in this run with
`gh api repos/actions/checkout/commits/<tag> --jq .sha`:

| SHA | Resolves to | Was annotated | Now |
| --- | --- | --- | --- |
| `de0fac2e4500dabe0009e67214ff5f5447ce83dd` | `v6.0.2` | `v4.2.2` in `sbom.yml`, `v6.0.2` in `ci.yml` / `accessibility.yml` | `v6.0.2` everywhere |
| `34e114876b0b11c390a56381ad16ebd13914f8d5` | `v4.3.1` | `v4` in six workflows, `v4.3.1` in `dependency-review.yml` | `v4.3.1` everywhere |

`gitleaks.yml` pins `11bd71901bbe5b1630ceea73d27597364c9af683` annotated
`v4.2.2`, which the API confirms — it is unchanged. No pinned SHA was altered,
so no action version changed; only the comments that describe them.

## Evidence

Backend/CI-only change with no web interface to screenshot. The evidence is the
new test going red against the unfixed comments and green after the fix:

Before (`node --test tests/action-pin-version-comments.test.js`):

```text
✖ every pinned SHA carries one version comment across the repository
  actual: [
    'actions/checkout@de0fac2e annotated v4.2.2, v6.0.2 at accessibility.yml:51 (v6.0.2), ci.yml:45 (v6.0.2), ci.yml:101 (v6.0.2), ci.yml:135 (v6.0.2), ci.yml:172 (v6.0.2), sbom.yml:48 (v4.2.2)',
    'actions/checkout@34e11487 annotated v4, v4.3.1 at deno-audit.yml:52 (v4), deno-outdated.yml:40 (v4), deno-quality.yml:33 (v4), dependency-review.yml:29 (v4.3.1), markdown-lint.yml:29 (v4), semgrep.yml:32 (v4), shellcheck.yml:28 (v4)'
  ]
✖ one action is not annotated with the same tag on two different SHAs
  actual: [ 'actions/checkout@v4.2.2 pinned to 11bd7190… and de0fac2e…' ]
```

After: `ℹ pass 6 / ℹ fail 0`, and the full gate `./quality.sh < /dev/null`
reports `[quality] All checks passed.` (264 Node tests, 95 Deno tests).

## Test Plan

- Added `tests/action-pin-version-comments.test.js`:
  - `collectPins` unit cases — tag read from the comment directly above a pin,
    a tag found past a `- name:` step header and extra comment lines, a pin with
    no matching annotation reported as untagged, and tag-ref/unpinned `uses:`
    lines ignored.
  - Repository-wide guard — every pinned SHA across `.github/workflows/` carries
    exactly one version comment (the drift finding this issue tracks).
  - Repository-wide guard — one action is never annotated with the same tag on
    two different SHAs.
- Re-ran the existing suites: `node --test tests/*.test.js` (264 pass) and
  `./quality.sh < /dev/null` (all checks passed).
