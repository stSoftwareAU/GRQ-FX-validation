// Tests for the PWA version-bump guard (issue #65).
//
// These exercise the real pure functions in helpers/version_check.ts with
// fixture file contents and assert on the returned results — no source
// grepping. A separate test loads the actual docs/ shell files and asserts
// they are mutually consistent; that test is the regression guard for the
// "fix the stale version" half of the issue.
//
// Australian English throughout (behaviour, colour, organisation).

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  APP_SHELL_FILES,
  appShellChanges,
  checkConsistency,
  collectVersionRefs,
  evaluateBump,
  extractVersionRefs,
  isAppShellFile,
  isValidSemver,
  type ShellFiles,
} from "../helpers/version_check.ts";

const REPO_ROOT = new URL("../", import.meta.url).pathname;

async function readShellFile(name: string): Promise<string> {
  return await Deno.readTextFile(`${REPO_ROOT}${name}`);
}

// A self-consistent fixture set at version 9.9.9.
function consistentFixture(version = "9.9.9"): ShellFiles {
  return {
    "docs/index.js": `const VERSION = "${version}";`,
    "docs/index.html":
      `<link rel="stylesheet" href="styles.css?v=${version}">\n` +
      `<script src="safe-card.js?v=${version}"></script>\n` +
      `<script src="index.js?v=${version}"></script>\n` +
      `v<span id="version">${version}</span>`,
    "docs/sw.js": `const CACHE_NAME = "grq-fx-v${version}";\n` +
      `const STATIC_CACHE_NAME = "grq-fx-static-v${version}";\n` +
      `const DYNAMIC_CACHE_NAME = "grq-fx-dynamic-v${version}";`,
    "docs/sw-register.js":
      `navigator.serviceWorker.register("./sw.js?v=${version}")`,
  };
}

// ---------------------------------------------------------------------------
// isValidSemver
// ---------------------------------------------------------------------------

Deno.test("isValidSemver - accepts major.minor.patch", () => {
  assert(isValidSemver("1.0.106"));
  assert(isValidSemver("10.20.30"));
});

Deno.test("isValidSemver - rejects malformed versions", () => {
  assertFalse(isValidSemver("1.0"));
  assertFalse(isValidSemver("v1.0.6"));
  assertFalse(isValidSemver("1.0.x"));
  assertFalse(isValidSemver(""));
});

// ---------------------------------------------------------------------------
// isAppShellFile / appShellChanges
// ---------------------------------------------------------------------------

Deno.test("isAppShellFile - recognises every enumerated shell file", () => {
  for (const f of APP_SHELL_FILES) {
    assert(isAppShellFile(f), `${f} should be an app-shell file`);
  }
});

Deno.test("isAppShellFile - tolerates a leading ./", () => {
  assert(isAppShellFile("./docs/index.js"));
});

Deno.test("isAppShellFile - excludes dated data dirs and non-shell files", () => {
  assertFalse(isAppShellFile("docs/2025-07-27/predictions.json"));
  assertFalse(isAppShellFile("docs/index.json"));
  assertFalse(isAppShellFile("docs/manifest.json"));
  assertFalse(isAppShellFile("docs/pr-summary-30.md"));
  assertFalse(isAppShellFile("README.md"));
  assertFalse(isAppShellFile("helpers/server.ts"));
});

Deno.test("appShellChanges - filters a mixed changed-file list", () => {
  const changed = [
    "docs/index.js",
    "docs/2025-08-01/predictions.json",
    "README.md",
    "docs/styles.css",
  ];
  assertEquals(appShellChanges(changed), ["docs/index.js", "docs/styles.css"]);
});

// ---------------------------------------------------------------------------
// extractVersionRefs
// ---------------------------------------------------------------------------

Deno.test("extractVersionRefs - reads the VERSION constant", () => {
  const refs = extractVersionRefs("docs/index.js", `const VERSION = "1.2.3";`);
  assertEquals(refs.length, 1);
  assertEquals(refs[0].version, "1.2.3");
});

Deno.test("extractVersionRefs - reads every query string and the span", () => {
  const html = `<link href="styles.css?v=1.2.3">` +
    `<script src="safe-card.js?v=1.2.3"></script>` +
    `v<span id="version">1.2.3</span>`;
  const refs = extractVersionRefs("docs/index.html", html);
  assertEquals(refs.map((r) => r.version), ["1.2.3", "1.2.3", "1.2.3"]);
});

Deno.test("extractVersionRefs - reads all three sw cache names", () => {
  const sw = `const CACHE_NAME = "grq-fx-v1.2.3";` +
    `const STATIC_CACHE_NAME = "grq-fx-static-v1.2.3";` +
    `const DYNAMIC_CACHE_NAME = "grq-fx-dynamic-v1.2.3";`;
  const refs = extractVersionRefs("docs/sw.js", sw);
  assertEquals(refs.length, 3);
  for (const r of refs) assertEquals(r.version, "1.2.3");
});

Deno.test("extractVersionRefs - reads the sw-register query string", () => {
  const refs = extractVersionRefs(
    "docs/sw-register.js",
    `navigator.serviceWorker.register("./sw.js?v=1.2.3")`,
  );
  assertEquals(refs.length, 1);
  assertEquals(refs[0].version, "1.2.3");
});

Deno.test("extractVersionRefs - yields nothing for a versionless file", () => {
  assertEquals(
    extractVersionRefs("docs/styles.css", "body { color: red; }"),
    [],
  );
});

// ---------------------------------------------------------------------------
// checkConsistency
// ---------------------------------------------------------------------------

Deno.test("checkConsistency - passes for a self-consistent set", () => {
  const result = checkConsistency(consistentFixture("9.9.9"));
  assert(result.consistent);
  assertEquals(result.version, "9.9.9");
  assertEquals(result.mismatches.length, 0);
});

Deno.test("checkConsistency - fails when one reference drifts", () => {
  const files = consistentFixture("9.9.9");
  // Bump styles.css alone, leaving the others stale — exactly the live bug.
  files["docs/index.html"] = files["docs/index.html"].replace(
    "styles.css?v=9.9.9",
    "styles.css?v=9.9.10",
  );
  const result = checkConsistency(files);
  assertFalse(result.consistent);
  assertEquals(result.version, null);
  assertEquals(result.mismatches.length, 1);
  assert(result.mismatches[0].source.includes("styles.css"));
});

Deno.test("checkConsistency - reports no references found", () => {
  const result = checkConsistency({ "docs/styles.css": "body{}" });
  assertFalse(result.consistent);
  assert(result.message.includes("No version references"));
});

Deno.test("checkConsistency - rejects a malformed version", () => {
  const result = checkConsistency({
    "docs/index.js": `const VERSION = "1.0";`,
  });
  assertFalse(result.consistent);
  assert(result.message.includes("Malformed"));
});

// ---------------------------------------------------------------------------
// evaluateBump
// ---------------------------------------------------------------------------

const consistentHead = (version: string) =>
  checkConsistency(consistentFixture(version));

Deno.test("evaluateBump - ok when no app-shell file changed", () => {
  const result = evaluateBump({
    changedAppShellFiles: [],
    baseVersion: "9.9.9",
    head: consistentHead("9.9.9"),
  });
  assert(result.ok);
  assertEquals(result.reason, "no-app-shell-change");
});

Deno.test("evaluateBump - fails when app-shell changed but version unchanged", () => {
  const result = evaluateBump({
    changedAppShellFiles: ["docs/index.js"],
    baseVersion: "9.9.9",
    head: consistentHead("9.9.9"),
  });
  assertFalse(result.ok);
  assertEquals(result.reason, "not-bumped");
  assert(result.message.includes("docs/index.js"));
  assert(result.message.includes("9.9.9"));
});

Deno.test("evaluateBump - ok when app-shell changed and version bumped", () => {
  const result = evaluateBump({
    changedAppShellFiles: ["docs/styles.css"],
    baseVersion: "9.9.9",
    head: consistentHead("9.9.10"),
  });
  assert(result.ok);
  assertEquals(result.reason, "bumped");
});

Deno.test("evaluateBump - fails when the working tree is inconsistent", () => {
  const files = consistentFixture("9.9.10");
  files["docs/sw.js"] = files["docs/sw.js"].replace(
    "grq-fx-v9.9.10",
    "grq-fx-v9.9.9",
  );
  const result = evaluateBump({
    changedAppShellFiles: ["docs/sw.js"],
    baseVersion: "9.9.9",
    head: checkConsistency(files),
  });
  assertFalse(result.ok);
  assertEquals(result.reason, "inconsistent");
});

Deno.test("evaluateBump - skips not-bumped check when base version unavailable", () => {
  const result = evaluateBump({
    changedAppShellFiles: ["docs/index.js"],
    baseVersion: null,
    head: consistentHead("9.9.9"),
  });
  assert(result.ok);
  assertEquals(result.reason, "no-base-version");
});

// ---------------------------------------------------------------------------
// Regression guard against the live shell files (the "fix stale version" half)
// ---------------------------------------------------------------------------

Deno.test("live docs/ shell files carry a single mutually-consistent version", async () => {
  const files: ShellFiles = {
    "docs/index.js": await readShellFile("docs/index.js"),
    "docs/index.html": await readShellFile("docs/index.html"),
    "docs/sw.js": await readShellFile("docs/sw.js"),
    "docs/sw-register.js": await readShellFile("docs/sw-register.js"),
  };
  const result = checkConsistency(files);
  assert(
    result.consistent,
    `docs/ shell files have inconsistent versions:\n${result.message}`,
  );
  // Sanity: we really did discover references across all four files.
  const refs = collectVersionRefs(files);
  assert(refs.length >= 8, `expected many version refs, saw ${refs.length}`);
});
