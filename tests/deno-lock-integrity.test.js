// Regression tests for the Deno lockfile integrity gate (issue #57).
//
// The repository imports the Deno standard library directly from
// `https://deno.land/std@<ver>/...` from `helpers/server.ts` and from
// several test files under `tests/*.test.ts`. Version-pinning the URL
// is not enough on its own: without a committed `deno.lock` the build
// will silently accept any bytes served for that URL, so a hijack of
// `deno.land/std`, a DNS detour, or a transparent proxy could replace
// the implementation between CI runs without anyone noticing.
//
// These tests assert the integrity floor:
//
//   1. A `deno.lock` exists at the repo root, is committed, and pins
//      every HTTPS std import found in `helpers/` and `tests/*.test.ts`
//      with a 64-character SHA-256 hash.
//   2. `quality.sh` runs the Deno test step with the `--frozen` flag so
//      a drift between source URLs and the lockfile is a CI failure,
//      not a silent re-fetch.
//
// The tests parse the lockfile JSON and the shell script as text — they
// never grep source files for the implementation pattern, and they fail
// loudly if either guarantee regresses.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const LOCK_PATH = path.join(REPO_ROOT, "deno.lock");
const QUALITY_PATH = path.join(REPO_ROOT, "quality.sh");

// Regex matching the std URLs the lockfile must pin. Mirrors the
// pattern in `renovate.json`'s custom manager so a future bump of the
// std version is automatically covered without test changes.
const STD_URL_RE = /https:\/\/deno\.land\/std@[^/"']+\/[^"']+/g;

function readFile(p) {
  return fs.readFileSync(p, "utf8");
}

function collectStdImports() {
  const files = [
    "helpers/server.ts",
    ...fs
      .readdirSync(path.join(REPO_ROOT, "tests"))
      .filter((f) => f.endsWith(".test.ts"))
      .map((f) => path.join("tests", f)),
  ];
  const urls = new Set();
  for (const rel of files) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const src = readFile(abs);
    const matches = src.match(STD_URL_RE) ?? [];
    for (const u of matches) urls.add(u);
  }
  return urls;
}

test("deno.lock exists at the repository root", () => {
  assert.ok(
    fs.existsSync(LOCK_PATH),
    "deno.lock must be committed so HTTPS std imports are integrity-pinned",
  );
});

test("deno.lock is valid JSON with a remote-URL integrity map", () => {
  const lock = JSON.parse(readFile(LOCK_PATH));
  assert.ok(
    lock.remote && typeof lock.remote === "object",
    "deno.lock must have a `remote` object mapping URLs to SHA-256 hashes",
  );
  const entries = Object.entries(lock.remote);
  assert.ok(entries.length > 0, "deno.lock.remote must not be empty");
  for (const [url, hash] of entries) {
    assert.match(
      url,
      /^https:\/\//,
      `lockfile entry ${url} must be an https URL`,
    );
    assert.match(
      String(hash),
      /^[a-f0-9]{64}$/,
      `lockfile hash for ${url} must be a 64-char hex SHA-256`,
    );
  }
});

test("every deno.land/std URL imported by the project is pinned in deno.lock", () => {
  const lock = JSON.parse(readFile(LOCK_PATH));
  const pinned = new Set(Object.keys(lock.remote ?? {}));
  const used = collectStdImports();
  assert.ok(
    used.size > 0,
    "expected at least one https://deno.land/std@... import (helpers/server.ts or tests/*.test.ts)",
  );
  for (const url of used) {
    assert.ok(
      pinned.has(url),
      `import ${url} is not pinned in deno.lock — run \`deno cache helpers/server.ts tests/*.test.ts\` to refresh the lockfile`,
    );
  }
});

test("quality.sh runs deno test with --frozen so lockfile drift fails CI", () => {
  const script = readFile(QUALITY_PATH);
  // The check focuses on behaviour: the deno test invocation must
  // include the `--frozen` flag. We look for `deno test` plus
  // `--frozen` on the same command (allowing other flags between).
  const denoTest = script.match(/deno\s+test\b[^\n]*/);
  assert.ok(
    denoTest,
    "quality.sh must invoke `deno test` to exercise the Deno suite",
  );
  assert.match(
    denoTest[0],
    /--frozen\b/,
    "quality.sh's deno test invocation must include --frozen so an out-of-date lockfile is a CI failure",
  );
});
