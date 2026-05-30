#!/usr/bin/env -S deno run --allow-read --allow-run=git
// CI guard (issue #65): fail a pull request when an app-shell file under
// docs/ changes without a consistent PWA version bump.
//
// This script is FAIL-ONLY: it never auto-bumps or commits. It prints a
// clear remediation message and exits non-zero so the developer (or the
// scripts/pre-commit hook) performs the bump.
//
// Usage:
//   deno run --allow-read --allow-run=git scripts/check-version-bump.ts [BASE_REF]
//
// BASE_REF defaults to origin/Develop (the only PR target branch in
// ci.yml). In CI it is passed the pull-request base SHA.
//
// All decision logic lives in helpers/version_check.ts and is unit-tested
// by tests/version-bump-guard.test.ts. This wrapper only performs git I/O.
//
// Australian English throughout (behaviour, colour, organisation).

import {
  appShellChanges,
  checkConsistency,
  evaluateBump,
  extractVersionRefs,
  type ShellFiles,
  VERSION_BEARING_FILES,
} from "../helpers/version_check.ts";

async function git(args: string[]): Promise<{ ok: boolean; out: string }> {
  const cmd = new Deno.Command("git", {
    args,
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout } = await cmd.output();
  return { ok: code === 0, out: new TextDecoder().decode(stdout) };
}

// Read a version-bearing file from the working tree, tolerating absence.
async function readWorkingTree(name: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(name);
  } catch {
    return null;
  }
}

async function main(): Promise<number> {
  const baseRef = Deno.args[0] ?? "origin/Develop";

  // Changed files versus the merge-base of baseRef and HEAD.
  const diff = await git(["diff", "--name-only", `${baseRef}...HEAD`]);
  if (!diff.ok) {
    // Could not diff (e.g. shallow clone without the base). Fail safe by
    // reporting rather than silently passing.
    console.error(
      `[version-guard] Could not diff against '${baseRef}'. ` +
        `Ensure the base ref is fetched (fetch-depth: 0).`,
    );
    return 1;
  }
  const changedFiles = diff.out.split("\n").map((l) => l.trim()).filter(Boolean);
  const changedShell = appShellChanges(changedFiles);

  // Working-tree contents of the version-bearing shell files.
  const files: ShellFiles = {};
  for (const name of VERSION_BEARING_FILES) {
    const content = await readWorkingTree(name);
    if (content !== null) files[name] = content;
  }
  const head = checkConsistency(files);

  // Base-branch VERSION constant (from docs/index.js on the base ref).
  let baseVersion: string | null = null;
  const baseIndexJs = await git(["show", `${baseRef}:docs/index.js`]);
  if (baseIndexJs.ok) {
    const refs = extractVersionRefs("docs/index.js", baseIndexJs.out);
    baseVersion = refs[0]?.version ?? null;
  }

  const result = evaluateBump({
    changedAppShellFiles: changedShell,
    baseVersion,
    head,
  });

  if (result.ok) {
    console.log(`[version-guard] PASS: ${result.message}`);
    return 0;
  }

  console.error("[version-guard] FAIL\n");
  console.error(result.message);
  return 1;
}

if (import.meta.main) {
  Deno.exit(await main());
}
