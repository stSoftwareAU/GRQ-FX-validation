## Summary

Added the **Dependency Review** GitHub Actions workflow at `.github/workflows/dependency-review.yml`. The workflow runs on every pull request and uses `actions/dependency-review-action@v4` to scan for vulnerable or disallowed dependency changes, improving the repository's security posture. Closes #3.

## Evidence

This is a CI configuration change with no UI surface to screenshot.

- The workflow YAML matches the template recommended by the issue.
- Validated locally with `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/dependency-review.yml'))"` — parses cleanly.
- `actions/dependency-review-action@v4` is the current major release maintained by GitHub.

```mermaid
flowchart LR
    PR[Pull Request opened] --> WF[Dependency Review workflow]
    WF --> CHK[actions/checkout@v4]
    CHK --> DR[actions/dependency-review-action@v4]
    DR -->|vulnerable dep found| FAIL[PR blocked]
    DR -->|clean| PASS[PR can merge]
```

## Test Plan

- [x] YAML syntax validated locally
- [ ] Workflow triggers on this PR (verifies the on/pull_request configuration end-to-end)
- [ ] Workflow appears in the repository's Actions tab after merge to `Develop`
