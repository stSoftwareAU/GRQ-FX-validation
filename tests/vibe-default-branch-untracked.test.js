// Regression test for issue #149: the Vibe Coder worker's per-clone
// default-branch cache (`.vibe_default_branch`) must not be tracked.
//
// The worker used to write the cache into the working tree and a copy was
// committed here. Since stSoftwareAU/VibeCoder#1652 the cache lives inside
// the clone's git directory (`.git/vibe/default_branch`), so the committed
// copy is dead weight — and a hidden file the repository's own policy says
// must not be checked in.
//
// The test exercises real git behaviour via `git ls-files`; it never greps
// source for an implementation pattern.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());

function trackedFiles() {
  const out = execFileSync("git", ["ls-files"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return out.split("\n").filter(Boolean);
}

test("the Vibe Coder default-branch cache is not tracked", () => {
  const offenders = trackedFiles().filter((f) =>
    f === ".vibe_default_branch" || f.endsWith("/.vibe_default_branch")
  );
  assert.deepEqual(
    offenders,
    [],
    `worker default-branch cache must not be tracked: ${offenders.join(", ")}`,
  );
});
