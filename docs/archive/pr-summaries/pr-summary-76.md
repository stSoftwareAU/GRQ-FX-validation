# Add a LICENSE file and declare the licence in deno.json

## Summary

The repository shipped a public-facing PWA to GitHub Pages with **no
licence at all**, so default "all rights reserved" copyright applied —
no one, including other parts of the organisation, had the legal right
to use, copy, modify or redistribute the code. This change adds an
explicit licence so the manifest, the licence file and the README all
agree.

- Added a top-level `LICENSE` file containing the full **Apache-2.0**
  text. Apache-2.0 is the organisation standard, matching the existing
  `stSoftwareAU/NEAT-AI`, `NEAT-AI-core` and `NEAT-AI-Examples`
  repositories.
- Declared the matching SPDX identifier in `deno.json`
  (`"license": "Apache-2.0"`) so the manifest and the file agree.
- Added a **Licence** section to `README.md` pointing at the `LICENSE`
  file and naming the SPDX short code.

Closes #76.

## Evidence

This is a docs/metadata change with no web interface to screenshot. It
is verified by the new regression test suite and the full quality gate.

```mermaid
flowchart LR
    A["LICENSE (Apache-2.0)"] -->|SPDX agrees| B["deno.json\n\"license\": \"Apache-2.0\""]
    A -->|linked from| C["README.md\n## Licence"]
    D["tests/license.test.js"] -->|asserts| A
    D -->|asserts| B
    D -->|asserts| C
```

Quality gate result:

```
ok | 69 passed | 0 failed (1s)
[quality] All checks passed.
```

`markdownlint-cli2 README.md` → `0 error(s)`.

## Test Plan

Added `tests/license.test.js` (Node.js `node:test`), which fails against
the unlicensed tree and passes after the fix:

- `LICENSE file exists at the repository root`
- `LICENSE contains the Apache-2.0 licence text` (heading, version, canonical URL)
- `deno.json declares the matching SPDX licence identifier` (`Apache-2.0`)
- `README.md has a Licence section pointing at the LICENSE file`

Run locally with:

```bash
node --test tests/license.test.js < /dev/null
./quality.sh < /dev/null
```
