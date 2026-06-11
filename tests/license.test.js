// Regression tests for the project licence (issue #76).
//
// The repository shipped a public-facing PWA to GitHub Pages with no
// licence at all, which means default "all rights reserved" copyright
// applied. These tests assert that:
//   - a top-level LICENSE file exists and is the Apache-2.0 text;
//   - deno.json declares the matching SPDX identifier so the manifest
//     and file agree; and
//   - README.md carries a Licence section pointing at the LICENSE file.
//
// Assertions are on parsed structure / content, not exact bytes, so
// reformatting does not break the suite.
//
// Australian English: licence (noun), organisation, behaviour.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const SPDX = "Apache-2.0";

function read(name) {
  const p = path.join(ROOT, name);
  assert.ok(fs.existsSync(p), `expected ${name} at the repository root`);
  return fs.readFileSync(p, "utf8");
}

// --- LICENSE file -----------------------------------------------------

test("LICENSE file exists at the repository root", () => {
  const p = path.join(ROOT, "LICENSE");
  assert.ok(fs.existsSync(p) && fs.statSync(p).isFile(), "LICENSE is missing");
});

test("LICENSE contains the Apache-2.0 licence text", () => {
  const text = read("LICENSE");
  assert.match(text, /Apache License/, "expected the Apache License heading");
  assert.match(text, /Version 2\.0/, "expected Apache version 2.0");
  assert.match(
    text,
    /www\.apache\.org\/licenses\/LICENSE-2\.0/,
    "expected the canonical Apache-2.0 URL",
  );
});

// --- deno.json declaration --------------------------------------------

test("deno.json declares the matching SPDX licence identifier", () => {
  const manifest = JSON.parse(read("deno.json"));
  assert.equal(
    manifest.license,
    SPDX,
    `deno.json "license" must be ${SPDX} to agree with the LICENSE file`,
  );
});

// --- README licence section -------------------------------------------

test("README.md has a Licence section pointing at the LICENSE file", () => {
  const text = read("README.md");
  const hasHeading = /^##\s+Licen[cs]e\b/im.test(text);
  assert.ok(hasHeading, "expected a `## Licence` (or `## License`) heading");
  assert.match(text, /Apache-2\.0/, "the README must name the SPDX licence");
  assert.match(
    text,
    /\]\(LICENSE\)/,
    "the README must link to the LICENSE file",
  );
});
