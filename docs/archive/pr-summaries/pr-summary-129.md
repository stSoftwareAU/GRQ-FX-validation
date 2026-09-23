## Summary

Closes #129

The `sbom` job's `actions/checkout` step in `.github/workflows/sbom.yml` did not
set `persist-credentials: false`, leaving `GITHUB_TOKEN` written to `.git/config`
as an auth header where any later step in the job — a compromised dependency or
an injected script — could read it and act as the token. The job only reads the
checked-out tree: it runs `deno run --allow-read --allow-write scripts/gen-sbom.ts`
and uploads `sbom.cdx.json` via `actions/upload-artifact`. It never pushes back to
the repository, creates no release asset and fetches no private submodules (the
workflow declares `permissions: contents: read`), so the credential does not need
to reach disk. Added `persist-credentials: false` under the checkout step's `with:`
block, leaving the pinned SHA and its `# actions/checkout@v6.0.2` version comment
untouched.

## Evidence

CLI/workflow-only change — no visual surface, so no screenshot is required.
`node --test tests/sbom-workflow.test.js` fails before the fix
(`persist-credentials` is `undefined`, expected `false`) and passes after (11
pass, 0 fail); the full `./quality.sh < /dev/null` gate passes (Node and Deno
suites, 0 failures).

## Test Plan

- Added `sbom job checkout does not persist the workflow token (issue #129)` in
  `tests/sbom-workflow.test.js`, parsing the real workflow YAML and asserting
  `persist-credentials: false` on every `actions/checkout` step in the `sbom`
  job. Confirmed it fails against the unfixed workflow (red) and passes after the
  fix (green).
- Ran the full `./quality.sh < /dev/null` gate — green, no existing test changed.
