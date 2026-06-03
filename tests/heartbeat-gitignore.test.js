// Regression tests for issue #89: transient worker runtime-state files
// (`.heartbeat_*`, `.heartbeat-marker_*`, `.pr_response_message`) must be
// git-ignored and must NOT be tracked in the repository.
//
// These were swept into the tree alongside an unrelated change (commit
// baae3ce) and churn history on every heartbeat, leak internal run
// identifiers, and produce noisy diffs. Generated/transient state has no
// business in version control.
//
// The tests exercise real git behaviour via `git check-ignore` and
// `git ls-files` — they never grep source for an implementation pattern.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());

// Sample paths that exercise each ignore pattern.
const SHOULD_IGNORE = [
  ".heartbeat_stSoftwareAU_GRQ-FX-validation_27",
  ".heartbeat_stSoftwareAU_GRQ-FX-validation_80",
  ".heartbeat-marker_stSoftwareAU_GRQ-FX-validation_27",
  ".heartbeat-marker_stSoftwareAU_GRQ-FX-validation_80",
  ".pr_response_message",
];

// `git check-ignore -q <path>` exits 0 when the path is ignored, 1 when not.
function isIgnored(relPath) {
  try {
    execFileSync("git", ["check-ignore", "-q", relPath], { cwd: REPO_ROOT });
    return true;
  } catch (err) {
    if (err.status === 1) return false;
    throw err;
  }
}

function trackedFiles() {
  const out = execFileSync("git", ["ls-files"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return out.split("\n").filter(Boolean);
}

test("heartbeat and pr-response runtime files are git-ignored", () => {
  for (const relPath of SHOULD_IGNORE) {
    assert.equal(
      isIgnored(relPath),
      true,
      `${relPath} should be matched by .gitignore`,
    );
  }
});

test("no .heartbeat* or .pr_response_message files are tracked", () => {
  const tracked = trackedFiles();
  const offenders = tracked.filter((f) =>
    /^\.heartbeat_/.test(f) ||
    /^\.heartbeat-marker_/.test(f) ||
    f === ".pr_response_message"
  );
  assert.deepEqual(
    offenders,
    [],
    `transient runtime-state files must not be tracked: ${offenders.join(", ")}`,
  );
});
