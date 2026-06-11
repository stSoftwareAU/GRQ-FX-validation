// Regression tests for the Renovate dependency-update quarantine
// gate (issue #17).
//
// Australian English: these tests verify a `renovate.json` exists at
// the repository root and enforces a minimum release age of at least
// 24 hours for every external (non-`stSoftwareAU/*`) dependency. This
// is the canonical supply-chain quarantine gate from the Vibe Coder
// policy — without it a future bump could pull in a freshly-published
// (and therefore not-yet-flagged) version of any of the GitHub
// Actions, Deno std imports, or CDN-loaded browser libraries used by
// this repo.
//
// The tests load the JSON config directly and assert on its parsed
// structure — they do not grep source text — so they remain green if
// the file is reformatted or extra fields are added, but fail loudly
// if the quarantine guarantee is weakened or removed.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const RENOVATE_PATH = path.join(REPO_ROOT, "renovate.json");

function loadConfig() {
  const raw = fs.readFileSync(RENOVATE_PATH, "utf8");
  return JSON.parse(raw);
}

// Parse a duration string like "24 hours" / "2 days" / "1 week" into
// hours. Renovate accepts a variety of human-readable forms so we
// normalise here before comparing.
function parseDurationToHours(value) {
  const m = String(value)
    .trim()
    .toLowerCase()
    .match(/^(\d+)\s*(hour|hours|day|days|week|weeks)$/);
  if (!m) {
    throw new Error(`Unrecognised duration string: ${value}`);
  }
  const n = Number(m[1]);
  const unit = m[2];
  if (unit.startsWith("hour")) return n;
  if (unit.startsWith("day")) return n * 24;
  if (unit.startsWith("week")) return n * 24 * 7;
  throw new Error(`Unrecognised duration unit: ${unit}`);
}

test("renovate.json exists at the repository root", () => {
  assert.ok(
    fs.existsSync(RENOVATE_PATH),
    `Expected Renovate config at ${RENOVATE_PATH}`,
  );
});

test("renovate.json parses as valid JSON", () => {
  assert.doesNotThrow(() => loadConfig());
});

test("renovate.json declares the Renovate schema", () => {
  const config = loadConfig();
  assert.equal(
    config["$schema"],
    "https://docs.renovatebot.com/renovate-schema.json",
    "renovate.json should declare the official Renovate JSON schema",
  );
});

test("renovate.json enforces a minimum release age of at least 24 hours", () => {
  const config = loadConfig();
  assert.ok(
    typeof config.minimumReleaseAge === "string",
    "renovate.json must set a top-level minimumReleaseAge",
  );
  const hours = parseDurationToHours(config.minimumReleaseAge);
  assert.ok(
    hours >= 24,
    `minimumReleaseAge must be at least 24 hours, got ${config.minimumReleaseAge} (${hours}h)`,
  );
});

test("renovate.json exempts internal stSoftwareAU/* packages from the quarantine", () => {
  const config = loadConfig();
  assert.ok(
    Array.isArray(config.packageRules) && config.packageRules.length > 0,
    "renovate.json must define packageRules",
  );
  const internalRule = config.packageRules.find((rule) => {
    const patterns = []
      .concat(rule.matchPackagePatterns ?? [])
      .concat(rule.matchPackageNames ?? []);
    return patterns.some((p) => /stSoftwareAU/.test(String(p)));
  });
  assert.ok(
    internalRule,
    "renovate.json must contain a packageRules entry that matches stSoftwareAU/*",
  );
  assert.ok(
    typeof internalRule.minimumReleaseAge === "string",
    "the stSoftwareAU/* rule must override minimumReleaseAge",
  );
  const hours = parseDurationToHours(internalRule.minimumReleaseAge);
  assert.equal(
    hours,
    0,
    "internal stSoftwareAU/* packages must update immediately (0 hours)",
  );
});

test("renovate.json enables the github-actions manager", () => {
  // Renovate enables github-actions by default; assert it is not
  // disabled, since disabling it would leave the workflow tag/SHA
  // bumps un-quarantined.
  const config = loadConfig();
  const enabledManagers = config.enabledManagers;
  if (Array.isArray(enabledManagers)) {
    assert.ok(
      enabledManagers.includes("github-actions"),
      "github-actions manager must be enabled",
    );
  }
  // If enabledManagers is undefined, Renovate's defaults apply and
  // github-actions is on.
});

test("renovate.json includes a custom manager for Deno std URL imports", () => {
  // `helpers/server.ts` imports `https://deno.land/std@<version>/...`
  // directly. Renovate's built-in managers do not catch URL imports
  // in arbitrary `.ts` files — a customManagers entry is required so
  // the quarantine applies to this ecosystem too.
  const config = loadConfig();
  const managers = config.customManagers ?? config.regexManagers ?? [];
  assert.ok(
    Array.isArray(managers) && managers.length > 0,
    "renovate.json must declare customManagers (or regexManagers)",
  );
  const denoManager = managers.find((m) => {
    const patterns = [].concat(m.matchStrings ?? []);
    // matchStrings are themselves regexes, so the literal dot may be
    // written as `\.` — accept either form.
    return patterns.some((p) => /deno\\?\.land\/std/.test(String(p)));
  });
  assert.ok(
    denoManager,
    "a customManagers entry must target https://deno.land/std imports",
  );
});

test("renovate.json includes a custom manager for CDN-loaded browser libraries", () => {
  // `docs/index.html` and `docs/sw.js` load Bootstrap, Chart.js, and
  // the chart.js-date-fns adapter from CDN URLs. Without a custom
  // manager Renovate would never see them and they would escape the
  // quarantine.
  const config = loadConfig();
  const managers = config.customManagers ?? config.regexManagers ?? [];
  const cdnManager = managers.find((m) => {
    const patterns = [].concat(m.matchStrings ?? []);
    return patterns.some((p) => /cdn|jsdelivr|unpkg/i.test(String(p)));
  });
  assert.ok(
    cdnManager,
    "a customManagers entry must target the CDN-loaded browser libraries",
  );
});

test("renovate.json enables OSV-driven security alerts", () => {
  // Issue #110: GitHub's native vulnerabilityAlerts API does not see
  // Deno URL imports or CDN <script> references — the dependency
  // surface this repo actually ships. osvVulnerabilityAlerts queries
  // the OSV advisory database directly (the same source deno audit
  // uses) so Renovate can raise an automated security-update PR for
  // the github-releases (deno_std) and npm (CDN) datasources the
  // custom managers already track. It is off by default and must be
  // explicitly enabled.
  const config = loadConfig();
  assert.equal(
    config.osvVulnerabilityAlerts,
    true,
    "renovate.json must set osvVulnerabilityAlerts: true so OSV-sourced security updates are raised automatically",
  );
});

test("renovate.json fast-lanes confirmed security updates past the quarantine", () => {
  // Issue #110: a confirmed security update must be able to bypass the
  // 24-hour minimumReleaseAge quarantine — this is the per-PR override
  // already sanctioned in SECURITY.md. The vulnerabilityAlerts rule
  // sets minimumReleaseAge to 0 hours for security bumps only; every
  // other update keeps the 24-hour default.
  const config = loadConfig();
  assert.ok(
    config.vulnerabilityAlerts &&
      typeof config.vulnerabilityAlerts === "object",
    "renovate.json must define a vulnerabilityAlerts rule",
  );
  assert.ok(
    typeof config.vulnerabilityAlerts.minimumReleaseAge === "string",
    "vulnerabilityAlerts must override minimumReleaseAge",
  );
  const hours = parseDurationToHours(
    config.vulnerabilityAlerts.minimumReleaseAge,
  );
  assert.equal(
    hours,
    0,
    "confirmed security updates must skip the quarantine (0 hours)",
  );
});

test("renovate.json labels security-update PRs", () => {
  // Issue #110: tagging the automated security PRs with a `security`
  // label lets maintainers spot and fast-track them per the SECURITY.md
  // emergency-bump runbook.
  const config = loadConfig();
  const labels = config.vulnerabilityAlerts?.labels ?? [];
  assert.ok(
    Array.isArray(labels) && labels.includes("security"),
    "vulnerabilityAlerts must apply a `security` label to raised PRs",
  );
});

test("renovate.json applies a minimum release age to GitHub Actions", () => {
  // Defence in depth: if a future edit accidentally sets
  // `minimumReleaseAge: 0` at the top level but leaves a per-manager
  // override, the per-manager value still has to be >= 24h for
  // GitHub Actions. We accept either the top-level setting >= 24h
  // (covered above) or a github-actions packageRules entry >= 24h.
  const config = loadConfig();
  const topLevelHours = parseDurationToHours(config.minimumReleaseAge);
  if (topLevelHours >= 24) return; // already enforced globally
  const ghaRule = (config.packageRules ?? []).find((rule) => {
    const managers = [].concat(rule.matchManagers ?? []);
    return managers.includes("github-actions");
  });
  assert.ok(
    ghaRule && parseDurationToHours(ghaRule.minimumReleaseAge) >= 24,
    "github-actions manager must have a >= 24h quarantine",
  );
});
