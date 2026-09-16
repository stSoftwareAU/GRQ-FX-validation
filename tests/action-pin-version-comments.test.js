// Regression tests for issue #150: every `uses:` pin in
// .github/workflows/ carries a `# owner/repo@tag` comment recording the
// tag its SHA resolves to. When the same SHA is annotated with two
// different tags the comments have drifted, and a reader trusting the
// comment picks the wrong version — the `version-comment-drift` finding
// the quality gate reports.
//
// Australian English: behaviour, annotated.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WORKFLOW_DIR = path.join(path.resolve(process.cwd()), ".github", "workflows");

const USES_RE = /^\s*(?:-\s*)?uses:\s*(\S+?)@([0-9a-f]{40})\s*$/;
// A step header may sit between the version comment and the `uses:`
// line (ci.yml puts `- name:` first), so walk over those too.
const STEP_HEADER_RE = /^\s*-\s*(?:name|if):/;

/**
 * Collect every SHA-pinned `uses:` in a workflow together with the tag
 * annotated in the nearest preceding `# owner/repo@tag` comment.
 * Returns an array of { action, sha, tag, line } — `tag` is null when
 * the pin carries no matching annotation.
 */
export function collectPins(yaml) {
  const lines = yaml.split("\n");
  const pins = [];

  for (let i = 0; i < lines.length; i++) {
    const use = lines[i].match(USES_RE);
    if (!use) continue;
    const [, action, sha] = use;

    let tag = null;
    for (let j = i - 1; j >= 0; j--) {
      const prev = lines[j];
      if (prev.trim() === "") break;
      const comment = prev.match(/^\s*#\s*(\S+?)@(\S+)\s*$/);
      if (comment && comment[1] === action) {
        tag = comment[2];
        break;
      }
      if (prev.trim().startsWith("#") || STEP_HEADER_RE.test(prev)) continue;
      break;
    }

    pins.push({ action, sha, tag, line: i + 1 });
  }

  return pins;
}

function workflowFiles() {
  return fs
    .readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
}

function allPins() {
  return workflowFiles().flatMap((file) =>
    collectPins(fs.readFileSync(path.join(WORKFLOW_DIR, file), "utf8")).map((pin) => ({
      ...pin,
      file,
    }))
  );
}

test("collectPins reads the tag from the comment above a pin", () => {
  const pins = collectPins([
    "    steps:",
    "      # actions/checkout@v4.3.1",
    "      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5",
  ].join("\n"));

  assert.deepEqual(pins, [{
    action: "actions/checkout",
    sha: "34e114876b0b11c390a56381ad16ebd13914f8d5",
    tag: "v4.3.1",
    line: 3,
  }]);
});

test("collectPins looks past a step header and extra comment lines", () => {
  const pins = collectPins([
    "      - name: Setup Node.js",
    "        # actions/setup-node@v6.4.0",
    "        # Pin to Node 22 LTS.",
    "        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
  ].join("\n"));

  assert.equal(pins.length, 1);
  assert.equal(pins[0].tag, "v6.4.0");
});

test("collectPins reports a pin with no matching annotation as untagged", () => {
  const pins = collectPins([
    "      # denoland/setup-deno@v2",
    "",
    "      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5",
  ].join("\n"));

  assert.equal(pins.length, 1);
  assert.equal(pins[0].tag, null);
});

test("collectPins ignores tag refs and unpinned uses", () => {
  assert.deepEqual(collectPins("      - uses: actions/checkout@v4"), []);
});

test("every pinned SHA carries one version comment across the repository", () => {
  const bySha = new Map();
  for (const pin of allPins()) {
    if (pin.tag === null) continue;
    if (!bySha.has(pin.sha)) bySha.set(pin.sha, []);
    bySha.get(pin.sha).push(pin);
  }

  const drifted = [];
  for (const [sha, pins] of bySha) {
    const tags = [...new Set(pins.map((p) => p.tag))].sort();
    if (tags.length > 1) {
      drifted.push(
        `${pins[0].action}@${sha.slice(0, 8)} annotated ${tags.join(", ")} at ` +
          pins.map((p) => `${p.file}:${p.line} (${p.tag})`).join(", "),
      );
    }
  }

  assert.deepEqual(drifted, [], `version-comment drift:\n${drifted.join("\n")}`);
});

test("one action is not annotated with the same tag on two different SHAs", () => {
  const byActionTag = new Map();
  for (const pin of allPins()) {
    if (pin.tag === null) continue;
    const key = `${pin.action}@${pin.tag}`;
    if (!byActionTag.has(key)) byActionTag.set(key, new Set());
    byActionTag.get(key).add(pin.sha);
  }

  const conflicting = [...byActionTag.entries()]
    .filter(([, shas]) => shas.size > 1)
    .map(([key, shas]) => `${key} pinned to ${[...shas].join(" and ")}`);

  assert.deepEqual(conflicting, []);
});
