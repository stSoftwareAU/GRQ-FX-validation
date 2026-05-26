// Regression tests for issue #39: every job across every workflow in
// .github/workflows/ must declare a `timeout-minutes:` field so a
// wedged step cannot hold a runner for GitHub's 360-minute default. An
// explicit per-job timeout caps free-tier exposure and surfaces hangs
// as failures within a sensible window.
//
// Australian English: behaviour, cancellation.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const WORKFLOW_DIR = path.join(REPO_ROOT, ".github", "workflows");

// Allowed range for `timeout-minutes:`. Anything above the upper bound
// is treated as an oversight (the GitHub default is 360 minutes — we
// want explicit, tight caps).
const MIN_TIMEOUT = 1;
const MAX_TIMEOUT = 60;

function readWorkflow(name) {
  return fs.readFileSync(path.join(WORKFLOW_DIR, name), "utf8");
}

// Parse out every job header (two-space indented key under `jobs:`)
// along with the lines of its body until the next job header or EOF.
// Returns an array of { name, bodyLines }.
function jobBlocks(yaml) {
  const lines = yaml.split("\n");
  const jobsIdx = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsIdx === -1) return [];

  const jobs = [];
  let current = null;
  for (let i = jobsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    // A column-0 key ends the jobs: block (e.g. another top-level key
    // would not normally appear after jobs, but stop defensively).
    if (/^\S/.test(line)) break;
    // Job header: exactly two spaces of indent, identifier, colon.
    const header = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (header) {
      if (current) jobs.push(current);
      current = { name: header[1], bodyLines: [] };
      continue;
    }
    if (current) current.bodyLines.push(line);
  }
  if (current) jobs.push(current);
  return jobs;
}

// Find a `timeout-minutes:` declaration in a job body. Only accept the
// four-space-indented form (i.e. a direct job key, not nested under a
// step or container). Returns the numeric value or null.
function jobTimeoutMinutes(bodyLines) {
  for (const line of bodyLines) {
    const m = line.match(/^ {4}timeout-minutes:\s*(\d+)\s*$/);
    if (m) return Number(m[1]);
  }
  return null;
}

const REQUIRED_WORKFLOWS = [
  "ci.yml",
  "dependency-review.yml",
  "gitleaks.yml",
  "markdown-lint.yml",
  "semgrep.yml",
  "shellcheck.yml",
];

for (const workflow of REQUIRED_WORKFLOWS) {
  test(`${workflow}: every job declares timeout-minutes`, () => {
    const yaml = readWorkflow(workflow);
    const jobs = jobBlocks(yaml);
    assert.ok(jobs.length > 0, `expected at least one job in ${workflow}`);
    for (const job of jobs) {
      const value = jobTimeoutMinutes(job.bodyLines);
      assert.notEqual(
        value,
        null,
        `expected \`timeout-minutes:\` on job '${job.name}' in ${workflow}`,
      );
      assert.ok(
        value >= MIN_TIMEOUT && value <= MAX_TIMEOUT,
        `timeout-minutes on '${job.name}' in ${workflow} must be in [${MIN_TIMEOUT}, ${MAX_TIMEOUT}], saw ${value}`,
      );
    }
  });
}
