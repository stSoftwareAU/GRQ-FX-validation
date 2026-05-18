# Add ShellCheck Lint workflow

## Summary

Adds a GitHub Actions workflow that runs ShellCheck against every pull request
to lift the quality bar on shell scripts in this repository. The workflow
matches the conventions already used by the Semgrep and Markdown Lint
workflows: third-party actions are pinned to a 40-character commit SHA (not a
floating tag), permissions are constrained to `contents: read`, and the
trigger is `pull_request` plus `push` to the default branch.

Closes #5.

## Evidence

This is a CI configuration change with no UI surface, so no screenshot is
attached. Verification performed locally:

- `python3 -c "import yaml; yaml.safe_load(...)"` confirms the workflow YAML
  parses cleanly.
- `shellcheck --severity=warning setup-hooks.sh helpers/server.sh` exits 0,
  so the new workflow will pass on the current `main`.
- `node --test tests/shellcheck-workflow.test.js` — 7/7 new regression tests
  pass, asserting the workflow's name, triggers, SHA-pinned actions, scandir,
  severity, permissions, and runner.

```mermaid
flowchart LR
    PR[Pull Request] --> CI[GitHub Actions]
    CI --> SC[ShellCheck workflow]
    SC --> Scan[ludeeus/action-shellcheck@SHA<br/>scandir=. severity=warning]
    Scan -->|warnings or errors| Fail[CI fails]
    Scan -->|clean| Pass[CI passes]
```

## Test Plan

- `tests/shellcheck-workflow.test.js` — new regression suite covering:
  - workflow file exists at `.github/workflows/shellcheck.yml`
  - declares `name: ShellCheck` and a `pull_request` trigger
  - pins `actions/checkout` to a 40-char commit SHA
  - pins `ludeeus/action-shellcheck` to a 40-char commit SHA (rejects
    `@master` to guard against supply-chain drift)
  - sets `scandir: .` and `severity: warning`
  - uses least-privilege `contents: read` permissions
  - runs on `ubuntu-latest`

Run with: `node --test tests/shellcheck-workflow.test.js`

## Notes

- `ludeeus/action-shellcheck` is pinned to `00cae500b08a931fb5698e11e79bfbd38e612a38`
  (release `2.0.0`) rather than the `@master` ref suggested in the issue
  template, per the repository policy that third-party Actions must be pinned
  to commit SHAs.
- No existing tests were modified or removed.
