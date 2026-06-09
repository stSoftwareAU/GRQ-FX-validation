# Security policy

This document explains how to report a security issue with the GRQ FX
Validation Dashboard and the procedure the maintainers follow to respond
to a compromised dependency under time pressure (issue #84).

## Reporting a vulnerability

Please report suspected vulnerabilities — including a suspected
supply-chain compromise of one of our dependencies — privately by email to:

- **<service@stsoftware.com.au>**

Include the affected component, a description of the issue and, where
possible, reproduction steps. Do **not** open a public GitHub issue for an
undisclosed vulnerability. We aim to acknowledge a report within two
business days and will keep you informed as we investigate.

## Emergency-bump procedure

When a supply-chain compromise of a dependency is disclosed, response speed
matters more than process. The maintainer on call fast-tracks a fix as
follows:

1. **Update** the affected package. This is a [Deno](https://deno.com/)
   project, so bump it with `deno outdated --update <pkg>` (or trigger the
   *Deno Dependency Updates* workflow from the Actions tab via
   `workflow_dispatch`). Internal `stSoftwareAU/*` packages may be bumped
   immediately; external packages otherwise sit behind Renovate's 24-hour
   quarantine (see [`renovate.json`](renovate.json)).
2. **Verify** the result with `deno audit` and the full quality gate,
   `./quality.sh`. The `--frozen` lock check in `quality.sh` confirms
   `deno.lock` is re-pinned to the new, audited bytes.
3. **Fast-track** the pull request against `Develop`: flag it as a security
   fix, request an expedited review and merge once the quality gate is
   green.

For the broader contribution workflow, see
[`CONTRIBUTING.md`](CONTRIBUTING.md).
