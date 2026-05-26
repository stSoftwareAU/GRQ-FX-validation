// Regression tests for issue #40: every GitHub Actions workflow under
// .github/workflows/ must declare a top-level `concurrency:` block so
// superseded runs are cancelled when a newer commit lands on the same
// ref. Without these groups, force-pushes and rapid back-to-back pushes
// burn runner minutes on stale runs and make the PR Checks panel
// ambiguous about "latest status".
//
// Australian English: behaviour, cancellation, group.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const WORKFLOW_DIR = path.join(REPO_ROOT, ".github", "workflows");

// Every workflow listed in issue #40 must declare a top-level
// concurrency block keyed on `${{ github.workflow }}-${{ github.ref }}`
// with `cancel-in-progress: true`. ci.yml is included even though its
// deploy-pages job uses a separate per-job group (see the dedicated
// test below).
const REQUIRED_WORKFLOWS = [
  "ci.yml",
  "dependency-review.yml",
  "gitleaks.yml",
  "markdown-lint.yml",
  "semgrep.yml",
  "shellcheck.yml",
];

function readWorkflow(name) {
  return fs.readFileSync(path.join(WORKFLOW_DIR, name), "utf8");
}

// Extract the top-level `concurrency:` block (a block whose key starts
// at column 0). Returns the block body lines (without the header) or
// null if no top-level block is present.
function topLevelConcurrencyBlock(yaml) {
  const lines = yaml.split("\n");
  const headerIdx = lines.findIndex((line) => /^concurrency:\s*$/.test(line));
  if (headerIdx === -1) return null;
  const body = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    // Stop when we leave the indented block (next column-0 key).
    if (/^\S/.test(line)) break;
    body.push(line);
  }
  return body;
}

for (const workflow of REQUIRED_WORKFLOWS) {
  test(`${workflow} declares a top-level concurrency block`, () => {
    const yaml = readWorkflow(workflow);
    const body = topLevelConcurrencyBlock(yaml);
    assert.ok(
      body !== null,
      `expected a top-level \`concurrency:\` block in ${workflow}`,
    );
  });

  test(`${workflow} concurrency group is keyed on workflow + ref`, () => {
    const yaml = readWorkflow(workflow);
    const body = topLevelConcurrencyBlock(yaml) ?? [];
    const groupLine = body.find((line) => /^\s+group:/.test(line));
    assert.ok(groupLine, `expected a \`group:\` key in ${workflow}`);
    // Match the canonical group expression from the GitHub Actions
    // security-hardening guide. Allow either single or double-quoted
    // expression wrappers since both are valid YAML.
    assert.match(
      groupLine,
      /group:\s*\$\{\{\s*github\.workflow\s*\}\}-\$\{\{\s*github\.ref\s*\}\}/,
      `expected canonical group expression in ${workflow}, saw '${groupLine.trim()}'`,
    );
  });

  test(`${workflow} cancels superseded runs`, () => {
    const yaml = readWorkflow(workflow);
    const body = topLevelConcurrencyBlock(yaml) ?? [];
    const cancelLine = body.find((line) => /^\s+cancel-in-progress:/.test(line));
    assert.ok(
      cancelLine,
      `expected a \`cancel-in-progress:\` key in ${workflow}`,
    );
    assert.match(
      cancelLine,
      /cancel-in-progress:\s*true/,
      `expected cancel-in-progress: true in ${workflow}, saw '${cancelLine.trim()}'`,
    );
  });
}

// GitHub's documented Pages deployment pattern recommends a separate
// concurrency group keyed on the environment ("pages") with
// `cancel-in-progress: false` so an in-flight Pages deploy is allowed
// to finish even when a newer Develop commit lands. This avoids
// half-published artifacts on the production site.
test("ci.yml deploy-pages job uses a separate 'pages' concurrency group", () => {
  const yaml = readWorkflow("ci.yml");
  // The deploy-pages job must declare its own per-job concurrency
  // block. Find the job header, then check the lines that follow for
  // the canonical Pages-recommended group + cancel-in-progress: false.
  const deployIdx = yaml.indexOf("\n  deploy-pages:");
  assert.notEqual(
    deployIdx,
    -1,
    "expected a deploy-pages job in ci.yml",
  );
  const deploySection = yaml.slice(deployIdx);
  assert.match(
    deploySection,
    /concurrency:\s*\n\s+group:\s*["']?pages["']?\s*\n\s+cancel-in-progress:\s*false/,
    "deploy-pages must declare `group: pages` with `cancel-in-progress: false` per GitHub Pages guidance",
  );
});
