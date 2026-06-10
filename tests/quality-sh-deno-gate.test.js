// Regression tests for quality.sh's CI-aware Deno gate (issue #104).
//
// Background: the Deno test suite (`deno test … tests/*.test.ts`) was run
// twice for every PR targeting Develop — once by ci.yml via quality.sh and
// again by deno-quality.yml (the canonical Deno gate, which also collects
// coverage). To remove the duplicate runner minutes while keeping
// quality.sh a complete local entry point, quality.sh now skips its Deno
// block when the CI environment variable is set and runs it otherwise.
//
// These tests exercise the real script. Stub `node` and `deno` binaries are
// placed first on PATH so the script runs fast and does not recurse into the
// real test suite; each stub records that it was invoked. The Deno marker's
// presence then tells us whether the gate ran the Deno suite.
//
// Australian English: behaviour, organisation.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = path.resolve(process.cwd());
const QUALITY_SH = path.join(REPO_ROOT, "quality.sh");

// Build a throwaway PATH directory holding stub `node` and `deno`
// executables that record each invocation by touching a marker file.
function makeStubBin(markerDir) {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "quality-stub-bin-"));
  const stub = (name) =>
    `#!/usr/bin/env bash\n` +
    `printf 'called\\n' >> ${path.join(markerDir, `${name}.marker`)}\n` +
    `exit 0\n`;
  for (const name of ["node", "deno"]) {
    const file = path.join(binDir, name);
    fs.writeFileSync(file, stub(name), { mode: 0o755 });
    fs.chmodSync(file, 0o755);
  }
  return binDir;
}

// Run quality.sh with the stub bin first on PATH. `ci` controls whether the
// CI variable is exported. Returns { result, nodeCalled, denoCalled }.
function runQuality({ ci }) {
  const markerDir = fs.mkdtempSync(path.join(os.tmpdir(), "quality-markers-"));
  const binDir = makeStubBin(markerDir);

  // Start from a clean environment so an ambient CI/GITHUB_ACTIONS value
  // (present when this very test runs inside CI) cannot leak into the
  // child and skew the result.
  const env = { ...process.env };
  delete env.CI;
  delete env.GITHUB_ACTIONS;
  env.PATH = `${binDir}${path.delimiter}${env.PATH}`;
  if (ci) env.CI = "true";

  const result = spawnSync("bash", [QUALITY_SH], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const nodeCalled = fs.existsSync(path.join(markerDir, "node.marker"));
  const denoCalled = fs.existsSync(path.join(markerDir, "deno.marker"));
  return { result, nodeCalled, denoCalled };
}

test("quality.sh runs the Deno suite locally (CI unset)", () => {
  const { result, nodeCalled, denoCalled } = runQuality({ ci: false });
  assert.equal(result.status, 0, `quality.sh failed: ${result.stderr}`);
  assert.ok(nodeCalled, "expected the Node test suite to run locally");
  assert.ok(
    denoCalled,
    "expected the Deno test suite to run locally when CI is unset",
  );
});

test("quality.sh skips the Deno suite in CI (CI=true)", () => {
  const { result, nodeCalled, denoCalled } = runQuality({ ci: true });
  assert.equal(result.status, 0, `quality.sh failed: ${result.stderr}`);
  assert.ok(nodeCalled, "the Node test suite must still run in CI");
  assert.ok(
    !denoCalled,
    "the Deno suite must be skipped in CI so deno-quality.yml is the sole runner",
  );
});

test("quality.sh explains the CI skip on stdout", () => {
  const { result } = runQuality({ ci: true });
  assert.equal(result.status, 0, `quality.sh failed: ${result.stderr}`);
  assert.match(
    result.stdout,
    /skip/i,
    "expected quality.sh to log that the Deno suite is skipped in CI",
  );
});
