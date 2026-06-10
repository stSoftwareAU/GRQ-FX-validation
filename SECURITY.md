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

## Supported versions

The dashboard is a continuously deployed Progressive Web App. GitHub Pages
serves a single live instance built from the `Develop` branch, so there is
no parallel release stream to back-port fixes to — security fixes are rolled
forward into the next deployment, which every visitor receives automatically
on their next load.

| Version                          | Supported          |
| -------------------------------- | ------------------ |
| Latest deployed (live `Develop`) | :white_check_mark: |
| Any earlier cached build         | :x:                |

If you are running a fork or a self-hosted copy, only the latest commit on
`Develop` is supported. Re-deploy from the current `Develop` head to pick up
security fixes.

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

### Bypassing the 24-hour quarantine for an actively-exploited CVE

Renovate quarantines every external dependency update for 24 hours
(`minimumReleaseAge: "24 hours"` in [`renovate.json`](renovate.json)) so a
freshly-published — and therefore not-yet-flagged — version cannot land
instantly. That window is the right default, but when a CVE is being
**actively exploited** the fix must land sooner. The agreed fast-lane is:

- A maintainer may **bypass the 24-hour quarantine** by bumping the
  dependency by hand (`deno outdated --update <pkg>`, or the *Deno
  Dependency Updates* workflow via `workflow_dispatch`) and opening a pull
  request directly. Renovate's release-age gate only governs the
  Renovate-raised PRs — a hand-raised PR is the documented override and
  does not wait out the window.
- The override **skips the waiting period, not the safety checks.** The PR
  must still pass `deno audit` and `./quality.sh` (including the `--frozen`
  `deno.lock` integrity check) and be **reviewed** by a second maintainer
  before merge. Do **not** lower or disable the quarantine in
  `renovate.json` to push a fix through — the override is per-PR and
  leaves the 24-hour default intact for every other update.

For the broader contribution workflow, see
[`CONTRIBUTING.md`](CONTRIBUTING.md).
