// Regression tests for issue #140: every SHA-pinned `actions/checkout`
// in .github/workflows/ must resolve to a major that ships on a
// supported Actions runtime. The v4.x majors ship the node20 runner,
// which GitHub removed on 2026-09-16, so a v4 pin fails the job outright
// however correct its SHA is. The pin is opaque — a 40-hex SHA names no
// runtime — so the recorded `# actions/checkout@tag` annotation is what
// the check reads, backed by an assertion that every workflow pins the
// same SHA.
//
// Australian English: behaviour, annotated, recognised.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { collectActionRefs, loadWorkflow } from "./_workflow-yaml.js";

const WORKFLOW_DIR = path.join(path.resolve(process.cwd()), ".github", "workflows");

const CHECKOUT = "actions/checkout";

// actions/checkout v6 is the first major published on the node24 runner;
// v1-v5 ship node12/16/20 runtimes GitHub has removed or deprecated.
const MIN_SUPPORTED_MAJOR = 6;

const ANNOTATION_RE = /^\s*#\s*(\S+?)@(\S+)\s*$/;

/**
 * Major version named by a `vN`-style tag. Returns null when the ref is
 * not a version tag (a branch, a SHA, an empty value), because only a
 * version tag carries runtime information.
 */
export function taggedMajor(ref) {
  const match = /^v(\d+)(?:[.\-+].*)?$/.exec(typeof ref === "string" ? ref.trim() : "");
  return match ? Number(match[1]) : null;
}

/**
 * Every `# owner/repo@tag` annotation for `action` in a workflow's text,
 * as { tag, line } pairs. Annotations are comments, so the YAML parser
 * cannot see them.
 */
export function annotationsFor(yamlText, action) {
  return yamlText.split("\n").flatMap((text, index) => {
    const match = ANNOTATION_RE.exec(text);
    return match && match[1] === action ? [{ tag: match[2], line: index + 1 }] : [];
  });
}

/**
 * Annotations naming a major below the first one on a supported
 * runtime. Refs that are not version tags are left alone — they carry no
 * runtime claim to judge.
 */
export function deprecatedRuntimeAnnotations(annotations, minimumMajor) {
  return annotations.filter(({ tag }) => {
    const major = taggedMajor(tag);
    return major !== null && major < minimumMajor;
  });
}

function workflowFiles() {
  return fs
    .readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
}

test("taggedMajor reads the major from a version tag", () => {
  assert.equal(taggedMajor("v4"), 4);
  assert.equal(taggedMajor("v4.2.2"), 4);
  assert.equal(taggedMajor("v6.0.2"), 6);
  assert.equal(taggedMajor("v11.0.0-beta.1"), 11);
});

test("taggedMajor returns null for refs that name no version", () => {
  assert.equal(taggedMajor("main"), null);
  assert.equal(taggedMajor("de0fac2e4500dabe0009e67214ff5f5447ce83dd"), null);
  assert.equal(taggedMajor("version4"), null);
  assert.equal(taggedMajor(""), null);
  assert.equal(taggedMajor(undefined), null);
});

test("annotationsFor collects only the requested action's comments", () => {
  const yaml = [
    "    steps:",
    "      # actions/checkout@v6.0.2",
    "      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
    "      # actions/setup-node@v4",
    "      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
  ].join("\n");

  assert.deepEqual(annotationsFor(yaml, CHECKOUT), [{ tag: "v6.0.2", line: 2 }]);
});

test("deprecatedRuntimeAnnotations flags majors below the supported floor", () => {
  const annotations = [
    { tag: "v4", line: 1 },
    { tag: "v4.2.2", line: 2 },
    { tag: "v6.0.2", line: 3 },
    { tag: "main", line: 4 },
  ];

  assert.deepEqual(
    deprecatedRuntimeAnnotations(annotations, MIN_SUPPORTED_MAJOR).map((a) => a.tag),
    ["v4", "v4.2.2"],
  );
});

test("no workflow pins actions/checkout to a deprecated-runtime major", () => {
  const offenders = workflowFiles().flatMap((file) => {
    const text = fs.readFileSync(path.join(WORKFLOW_DIR, file), "utf8");
    return deprecatedRuntimeAnnotations(annotationsFor(text, CHECKOUT), MIN_SUPPORTED_MAJOR)
      .map(({ tag, line }) => `${file}:${line} pins ${CHECKOUT}@${tag}`);
  });

  assert.deepEqual(
    offenders,
    [],
    `actions/checkout below v${MIN_SUPPORTED_MAJOR} runs on a removed node20 runtime:\n` +
      offenders.join("\n"),
  );
});

test("every workflow pins actions/checkout to the same SHA", () => {
  const pins = workflowFiles().flatMap((file) =>
    collectActionRefs(loadWorkflow(file))
      .filter((ref) => ref.action === CHECKOUT)
      .map((ref) => ({ file, sha: ref.ref })),
  );

  assert.ok(pins.length > 0, "expected at least one actions/checkout pin");

  const shas = [...new Set(pins.map((p) => p.sha))];
  assert.deepEqual(
    shas.length,
    1,
    `actions/checkout pinned to ${shas.length} different SHAs: ` +
      pins.map((p) => `${p.file} -> ${p.sha.slice(0, 8)}`).join(", "),
  );
});
