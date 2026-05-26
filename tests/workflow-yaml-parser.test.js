// Unit tests for tests/_workflow-yaml.js — the minimal YAML parser the
// workflow regression tests rely on.
//
// Issue #42: the old workflow tests regex-matched the raw YAML text, so
// reformatting the file (extra blank lines, quoted vs unquoted scalars,
// reordered keys) broke the tests even when the CI gate was unchanged.
// The new tests parse the YAML into a JavaScript object and assert on
// the structured fields. That contract only holds if the parser itself
// produces a stable structure under benign reformatting — these tests
// pin that property.
//
// Australian English: behaviour, colour, organisation.

import test from "node:test";
import assert from "node:assert/strict";
import { parseYaml, collectActionRefs } from "./_workflow-yaml.js";

test("parser extracts top-level scalar keys", () => {
  const out = parseYaml(`name: Gitleaks
on:
  pull_request:
    branches: ["*"]
`);
  assert.equal(out.name, "Gitleaks");
  assert.deepEqual(out.on, { pull_request: { branches: ["*"] } });
});

test("parser captures step uses + with as a nested map", () => {
  const out = parseYaml(`jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
        with:
          fetch-depth: 0
`);
  const step = out.jobs.gitleaks.steps[0];
  assert.equal(step.uses, "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683");
  assert.equal(step.with["fetch-depth"], 0);
});

test("parser preserves multi-line `run:` block as a single string", () => {
  const out = parseYaml(`jobs:
  foo:
    steps:
      - name: harden
        shell: bash
        run: |
          set -euo pipefail
          echo hello
`);
  const step = out.jobs.foo.steps[0];
  assert.equal(step.shell, "bash");
  assert.ok(step.run.startsWith("set -euo pipefail"));
  assert.ok(step.run.includes("echo hello"));
});

test("parser ignores comment-only lines and trailing comments", () => {
  const out = parseYaml(`# leading comment
name: Foo  # trailing comment
permissions:
  # inline comment line
  contents: read
`);
  assert.equal(out.name, "Foo");
  assert.equal(out.permissions.contents, "read");
});

test("parser handles boolean and integer scalars", () => {
  const out = parseYaml(`concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  x:
    timeout-minutes: 10
`);
  assert.equal(out.concurrency["cancel-in-progress"], false);
  assert.equal(out.jobs.x["timeout-minutes"], 10);
});

test("parser is robust to benign reformatting (extra blank lines, reordering)", () => {
  const original = parseYaml(`name: Foo
on:
  pull_request:
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@aaaa
`);
  const reformatted = parseYaml(`
permissions:
  contents: read

name: Foo

on:
  pull_request:

jobs:
  a:
    steps:
      - uses: actions/checkout@aaaa
    runs-on: ubuntu-latest
`);
  // Reformatting preserves the structured contract.
  assert.equal(reformatted.name, original.name);
  assert.equal(
    reformatted.permissions.contents,
    original.permissions.contents,
  );
  assert.equal(
    reformatted.jobs.a["runs-on"],
    original.jobs.a["runs-on"],
  );
  assert.equal(
    reformatted.jobs.a.steps[0].uses,
    original.jobs.a.steps[0].uses,
  );
});

test("collectActionRefs flattens uses refs across every job", () => {
  const wf = parseYaml(`jobs:
  one:
    steps:
      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      - uses: actions/setup-node@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  two:
    steps:
      - uses: actions/deploy-pages@cccccccccccccccccccccccccccccccccccccccc
`);
  const refs = collectActionRefs(wf);
  assert.deepEqual(refs, [
    { action: "actions/checkout", ref: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    { action: "actions/setup-node", ref: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    { action: "actions/deploy-pages", ref: "cccccccccccccccccccccccccccccccccccccccc" },
  ]);
});

test("collectActionRefs surfaces a floating @v4 tag as a non-SHA ref", () => {
  // Regression for the assertion that the suite must reject floating
  // tags: parsing `actions/checkout@v4` must yield ref === 'v4', not a
  // 40-character SHA. The floating-tag tests in the workflow files
  // depend on this behaviour.
  const wf = parseYaml(`jobs:
  one:
    steps:
      - uses: actions/checkout@v4
`);
  const refs = collectActionRefs(wf);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].ref, "v4");
  assert.doesNotMatch(refs[0].ref, /^[0-9a-f]{40}$/);
});
