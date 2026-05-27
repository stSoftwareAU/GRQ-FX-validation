## Summary

Moved the theme toggle button's colour styling out of inline `style=` attributes and JS `.style.*` writes and into theme-aware CSS classes, so the cascade — not JavaScript — drives how the button looks in each theme. Closes #45.

- Removed the inline `style="border: ...; background-color: ..."` attribute from `#dark-mode-toggle` in `docs/index.html` and seeded a `theme-toggle-auto` class on the button.
- Replaced the per-case `toggleButton.style.backgroundColor` / `toggleButton.style.color` writes in `updateDarkMode()` (`docs/index.js`) with `classList` swaps between `theme-toggle-light`, `theme-toggle-dark` and `theme-toggle-auto`. Emoji `textContent` and `title` updates are unchanged (covered by #34).
- Added theme-aware `#dark-mode-toggle` rules to `docs/styles.css` for the three states established in #44: `body.light-mode-forced`, `body.dark-mode-forced`, and `@media (prefers-color-scheme: dark) body:not(.dark-mode-forced)`. The default rule keeps the translucent white-on-purple look for auto + system-light and preserves the existing 40×40 touch target.
- Bumped the `styles.css` cache-busting query to `?v=1.0.105`.

## Evidence

```mermaid
flowchart LR
    A[index.html: inline style removed] --> C[CSS controls button colour]
    B[index.js: classList instead of .style] --> C
    C --> D{Theme state}
    D -->|light-mode-forced| E[light-forced rule: dark border on light bg]
    D -->|dark-mode-forced| F[dark-forced rule: light border on dark bg]
    D -->|auto + system light| G[default rule: translucent white on purple]
    D -->|auto + system dark| H[@media prefers-color-scheme: dark rule]
```

Playwright MCP was not available in this worker, so fresh per-state toggle screenshots could not be captured. The header banner — which contains the toggle — was screenshotted in each state for issue #44; those shots are re-used here as the visual context for where the toggle sits, as the issue explicitly permits:

![Auto + system light header](docs/evidence/issue-44-header-auto-system-light.png)
![Auto + system dark header](docs/evidence/issue-44-header-auto-system-dark.png)
![Light forced header](docs/evidence/issue-44-header-light-forced.png)
![Dark forced header](docs/evidence/issue-44-header-dark-forced.png)

Expected toggle appearance after this change:

| Theme state | Border | Background | Icon colour | Notes |
| --- | --- | --- | --- | --- |
| Auto + system-light (default) | `rgba(255,255,255,0.8)` | `rgba(255,255,255,0.1)` | `white` | Translucent over brand purple — unchanged from pre-PR. |
| Light forced | `rgba(33,37,41,0.6)` | `rgba(255,255,255,0.9)` | `#212529` | Dark icon on near-white pill against the light header. |
| Dark forced | `rgba(240,246,252,0.7)` | `rgba(0,0,0,0.6)` | `#f0f6fc` | Light icon on dark pill against the dark header. |
| Auto + system-dark | as dark-forced | as dark-forced | as dark-forced | `@media (prefers-color-scheme: dark) body:not(.dark-mode-forced)`. |

All four states preserve `min-width: 40px` and `min-height: 40px` (the touch-target invariant from before the refactor) via the default rule.

## Test Plan

- Added `tests/theme-toggle-styling.test.js` with eight assertions:
  - `#dark-mode-toggle` in `docs/index.html` has no inline `style=` attribute.
  - `updateDarkMode()` in `docs/index.js` writes neither `toggleButton.style.backgroundColor` nor `toggleButton.style.color`.
  - `updateDarkMode()` mutates `toggleButton.classList` instead.
  - `docs/styles.css` ships `#dark-mode-toggle` overrides for `body.light-mode-forced`, `body.dark-mode-forced`, and the `@media (prefers-color-scheme: dark) body:not(.dark-mode-forced)` block.
  - The default `#dark-mode-toggle` rule keeps `min-width`/`min-height` at >= 40px.
  - The `styles.css` cache-busting query is greater than `1.0.104`.
- `./quality.sh < /dev/null` passes — Node suite plus Deno suite, 44 Deno tests + the new Node tests all green.
