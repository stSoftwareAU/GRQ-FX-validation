// Regression tests for issue #141: a workflow must not pin an action to
// a major the repository has already moved past. `markdown-lint.yml`
// pinned `actions/setup-node` at v4 while `ci.yml` and
// `accessibility.yml` had already adopted v6.4.0, so one gate kept
// running on the deprecated node20 runner while the rest did not.
//
// A 40-hex SHA names no version, so the recorded `# owner/repo@tag`
// annotation is the only in-repo signal of which major a pin ships. The
// rule below is deliberately action-agnostic: whatever the highest major
// the repository annotates for an action, every other pin of that same
// action must be on it, so any future straggler is caught without the
// test naming the action.
//
// Australian English: behaviour, recognised, organisation.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WORKFLOW_DIR = path.join(path.resolve(process.cwd()), ".github", "workflows");

const ANNOTATION_RE = /^\s*#\s*(\S+\/\S+?)@(\S+)\s*$/;

/**
 * Major version named by a `vN`-style tag, or null when the ref carries
 * no version claim (a branch, a SHA, an empty value).
 */
export function taggedMajor(ref) {
  const match = /^v(\d+)(?:[.\-+].*)?$/.exec(typeof ref === "string" ? ref.trim() : "");
  return match ? Number(match[1]) : null;
}

/**
 * Every `# owner/repo@tag` annotation in a workflow's text, as
 * { action, tag, line } records. Annotations are comments, so the YAML
 * parser cannot see them.
 */
export function annotations(yamlText) {
  return String(yamlText ?? "").split("\n").flatMap((text, index) => {
    const match = ANNOTATION_RE.exec(text);
    return match ? [{ action: match[1], tag: match[2], line: index + 1 }] : [];
  });
}

/**
 * Annotations naming a major below the highest major the same action is
 * annotated with anywhere in the set. Refs that name no version are
 * ignored — they make no version claim to compare.
 */
export function staleMajorPins(records) {
  const highest = new Map();
  for (const record of records) {
    const major = taggedMajor(record.tag);
    if (major === null) continue;
    const seen = highest.get(record.action);
    if (seen === undefined || major > seen) highest.set(record.action, major);
  }

  return records.filter((record) => {
    const major = taggedMajor(record.tag);
    return major !== null && major < highest.get(record.action);
  });
}

function workflowFiles() {
  return fs
    .readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
}

function repositoryAnnotations() {
  return workflowFiles().flatMap((file) =>
    annotations(fs.readFileSync(path.join(WORKFLOW_DIR, file), "utf8"))
      .map((record) => ({ ...record, file })),
  );
}

test("annotations reads every action version comment", () => {
  const yaml = [
    "    steps:",
    "      # actions/checkout@v6.0.2",
    "      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
    "      # a prose comment, not an annotation",
    "      # actions/setup-node@v6.4.0",
    "      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
  ].join("\n");

  assert.deepEqual(annotations(yaml), [
    { action: "actions/checkout", tag: "v6.0.2", line: 2 },
    { action: "actions/setup-node", tag: "v6.4.0", line: 5 },
  ]);
});

test("annotations returns nothing for text that carries none", () => {
  assert.deepEqual(annotations(""), []);
  assert.deepEqual(annotations(undefined), []);
  assert.deepEqual(annotations("run: npm test # not an action@tag"), []);
});

test("taggedMajor reads the major from a version tag", () => {
  assert.equal(taggedMajor("v4"), 4);
  assert.equal(taggedMajor("v6.4.0"), 6);
  assert.equal(taggedMajor("v11.0.0-beta.1"), 11);
  assert.equal(taggedMajor("main"), null);
  assert.equal(taggedMajor("48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e"), null);
  assert.equal(taggedMajor(undefined), null);
});

test("staleMajorPins flags a pin left behind the adopted major", () => {
  const records = [
    { file: "ci.yml", action: "actions/setup-node", tag: "v6.4.0", line: 1 },
    { file: "markdown-lint.yml", action: "actions/setup-node", tag: "v4", line: 2 },
    { file: "ci.yml", action: "actions/checkout", tag: "v6.0.2", line: 3 },
  ];

  assert.deepEqual(
    staleMajorPins(records).map((r) => `${r.file}:${r.line} ${r.action}@${r.tag}`),
    ["markdown-lint.yml:2 actions/setup-node@v4"],
  );
});

test("staleMajorPins ignores refs that make no version claim", () => {
  const records = [
    { file: "a.yml", action: "owner/act", tag: "v3", line: 1 },
    { file: "b.yml", action: "owner/act", tag: "main", line: 2 },
  ];

  assert.deepEqual(staleMajorPins(records), []);
});

test("staleMajorPins is empty when an action is pinned consistently", () => {
  const records = [
    { file: "a.yml", action: "owner/act", tag: "v6.4.0", line: 1 },
    { file: "b.yml", action: "owner/act", tag: "v6.4.0", line: 2 },
  ];

  assert.deepEqual(staleMajorPins(records), []);
});

test("no workflow pins an action to a major the repository has moved past", () => {
  const records = repositoryAnnotations();
  assert.ok(records.length > 0, "expected at least one action version comment");

  const stale = staleMajorPins(records)
    .map((r) => `${r.file}:${r.line} pins ${r.action}@${r.tag}`);

  assert.deepEqual(
    stale,
    [],
    "these pins are behind the major the repository has already adopted for the same action:\n" +
      stale.join("\n"),
  );
});

test("every actions/setup-node pin names the same tag (issue #141)", () => {
  const tags = [
    ...new Set(
      repositoryAnnotations()
        .filter((r) => r.action === "actions/setup-node")
        .map((r) => r.tag),
    ),
  ];

  assert.ok(tags.length > 0, "expected at least one actions/setup-node annotation");
  assert.deepEqual(
    tags.length,
    1,
    `actions/setup-node annotated with ${tags.length} different tags: ${tags.join(", ")}`,
  );
});
