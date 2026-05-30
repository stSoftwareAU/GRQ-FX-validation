// PWA version-bump guard for the GRQ FX Validation Dashboard (issue #65).
//
// The PWA served from docs/ busts browser and service-worker caches with a
// single VERSION, mirrored into:
//   - the `const VERSION = "x.y.z"` constant in docs/index.js,
//   - the `?v=x.y.z` cache-bust query strings in docs/index.html (and the
//     `sw.js?v=` query string in docs/sw-register.js),
//   - the version display `<span id="version">x.y.z</span>` in index.html,
//   - the `grq-fx-...v x.y.z` cache names in docs/sw.js.
//
// If an app-shell file is changed without bumping every one of those
// references in lock-step, the deployed PWA serves stale cached assets.
// This module provides the pure, testable logic behind the CI guard that
// fails such a pull request. It performs no I/O — callers pass file
// contents in — so it is trivially unit-testable.
//
// Australian English throughout (behaviour, colour, organisation).

// A single version reference discovered in a shell file.
export interface VersionRef {
  // Human-readable location, e.g. `index.html styles.css?v=`.
  source: string;
  // The semantic-version string found, e.g. `1.0.106`.
  version: string;
}

// Files extractVersionRefs() knows how to scan for embedded versions. The
// remaining root-level shell assets (styles.css, safe-card.js, …) carry no
// internal version — they are cache-busted via index.html query strings.
export const VERSION_BEARING_FILES: readonly string[] = [
  "docs/index.js",
  "docs/index.html",
  "docs/sw.js",
  "docs/sw-register.js",
];

// Root-level docs/ shell assets that are cache-busted on deploy. Changing
// any of these without a version bump leaves the deployed PWA serving stale
// cached bytes, so the CI guard treats them as the "app shell". This is a
// superset of the five files enumerated in issue #65: the other root-level
// .js assets are loaded and cache-busted by index.html in exactly the same
// way, so the guard covers them too. Dated daily-data directories
// (docs/YYYY-MM-DD/…) and data/config files (*.json, *.md, images) are
// deliberately excluded.
export const APP_SHELL_FILES: readonly string[] = [
  "docs/index.html",
  "docs/index.js",
  "docs/sw.js",
  "docs/sw-register.js",
  "docs/styles.css",
  "docs/safe-card.js",
  "docs/safe-error-banner.js",
  "docs/yahoo-validate.js",
];

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

// True when `version` is a bare `major.minor.patch` string.
export function isValidSemver(version: string): boolean {
  return SEMVER_RE.test(version);
}

// True when `filePath` (repo-relative, optional leading `./`) is an
// app-shell file whose change requires a version bump.
export function isAppShellFile(filePath: string): boolean {
  const normalised = filePath.replace(/^\.\//, "").trim();
  return APP_SHELL_FILES.includes(normalised);
}

// Return only the app-shell entries from a list of changed file paths.
export function appShellChanges(changedFiles: readonly string[]): string[] {
  return changedFiles.filter((f) => isAppShellFile(f));
}

// Extract every version reference embedded in a single shell file. The same
// four patterns are applied to every file; a file simply yields no refs for
// patterns it does not contain.
export function extractVersionRefs(
  filename: string,
  content: string,
): VersionRef[] {
  const refs: VersionRef[] = [];

  // 1. The VERSION constant: const VERSION = "1.0.106";
  const constMatch = content.match(/const\s+VERSION\s*=\s*["']([^"']+)["']/);
  if (constMatch) {
    refs.push({
      source: `${filename} VERSION constant`,
      version: constMatch[1],
    });
  }

  // 2. Cache-bust query strings: name.js?v=1.0.106 / name.css?v=1.0.106
  const queryRe = /([A-Za-z0-9_.-]+\.(?:js|css))\?v=(\d+\.\d+\.\d+)/g;
  for (const m of content.matchAll(queryRe)) {
    refs.push({ source: `${filename} ${m[1]}?v=`, version: m[2] });
  }

  // 3. The version display span: <span id="version">1.0.106</span>
  const spanMatch = content.match(
    /<span id="version">\s*v?(\d+\.\d+\.\d+)\s*<\/span>/,
  );
  if (spanMatch) {
    refs.push({ source: `${filename} version span`, version: spanMatch[1] });
  }

  // 4. Service-worker cache names: grq-fx-v / grq-fx-static-v / grq-fx-dynamic-v
  const cacheRe = /grq-fx-(?:[a-z]+-)?v(\d+\.\d+\.\d+)/g;
  for (const m of content.matchAll(cacheRe)) {
    refs.push({ source: `${filename} cache name`, version: m[1] });
  }

  return refs;
}

// Map of version-bearing shell file contents, keyed by repo-relative path.
export type ShellFiles = Record<string, string>;

// Collect every version reference across all supplied shell files.
export function collectVersionRefs(files: ShellFiles): VersionRef[] {
  const refs: VersionRef[] = [];
  for (const [filename, content] of Object.entries(files)) {
    refs.push(...extractVersionRefs(filename, content));
  }
  return refs;
}

export interface ConsistencyResult {
  // True when at least one reference was found and all references agree.
  consistent: boolean;
  // The agreed version when consistent, otherwise null.
  version: string | null;
  // Every reference discovered.
  refs: VersionRef[];
  // References whose version differs from the canonical version.
  mismatches: VersionRef[];
  // Human-readable summary suitable for CI output.
  message: string;
}

// Verify that every version reference across the shell files is mutually
// consistent. The canonical version is taken from docs/index.js's VERSION
// constant when present, otherwise the first reference found.
export function checkConsistency(files: ShellFiles): ConsistencyResult {
  const refs = collectVersionRefs(files);

  if (refs.length === 0) {
    return {
      consistent: false,
      version: null,
      refs,
      mismatches: [],
      message: "No version references found in the app-shell files.",
    };
  }

  const invalid = refs.filter((r) => !isValidSemver(r.version));
  if (invalid.length > 0) {
    const detail = invalid
      .map((r) =>
        `  - ${r.source}: '${r.version}' is not a valid major.minor.patch version`
      )
      .join("\n");
    return {
      consistent: false,
      version: null,
      refs,
      mismatches: invalid,
      message: `Malformed version reference(s):\n${detail}`,
    };
  }

  const canonical =
    refs.find((r) => r.source.includes("VERSION constant"))?.version ??
      refs[0].version;
  const mismatches = refs.filter((r) => r.version !== canonical);

  if (mismatches.length === 0) {
    return {
      consistent: true,
      version: canonical,
      refs,
      mismatches: [],
      message:
        `All ${refs.length} version references are consistent at ${canonical}.`,
    };
  }

  const detail = mismatches
    .map((r) => `  - ${r.source}: ${r.version} (expected ${canonical})`)
    .join("\n");
  return {
    consistent: false,
    version: null,
    refs,
    mismatches,
    message:
      `Inconsistent version references (expected ${canonical} from docs/index.js VERSION constant):\n${detail}`,
  };
}

export interface BumpEvaluation {
  // True when the guard is satisfied.
  ok: boolean;
  // Machine-readable outcome.
  reason:
    | "inconsistent"
    | "no-app-shell-change"
    | "not-bumped"
    | "bumped"
    | "no-base-version";
  // Human-readable message for CI output.
  message: string;
}

const REMEDIATION =
  "Bump the VERSION constant in docs/index.js and mirror it into docs/index.html " +
  "(?v= query strings and the version span), docs/sw-register.js (sw.js?v=) and " +
  "docs/sw.js (grq-fx-... cache names). Install the pre-commit hook with " +
  "./setup-hooks.sh to auto-increment, or edit the version by hand.";

// Decide whether a pull request satisfies the version-bump guard.
export function evaluateBump(args: {
  // App-shell files changed versus the base branch.
  changedAppShellFiles: readonly string[];
  // The VERSION constant on the base branch, or null when unavailable.
  baseVersion: string | null;
  // Consistency result for the working tree (head).
  head: ConsistencyResult;
}): BumpEvaluation {
  const { changedAppShellFiles, baseVersion, head } = args;

  // The working tree must itself be internally consistent, regardless of
  // whether any app-shell file changed.
  if (!head.consistent) {
    return {
      ok: false,
      reason: "inconsistent",
      message: `${head.message}\n\n${REMEDIATION}`,
    };
  }

  if (changedAppShellFiles.length === 0) {
    return {
      ok: true,
      reason: "no-app-shell-change",
      message: "No app-shell files changed; a version bump is not required.",
    };
  }

  if (baseVersion === null) {
    return {
      ok: true,
      reason: "no-base-version",
      message:
        "Could not read the base-branch version; skipping the not-bumped check " +
        `(working tree is internally consistent at ${head.version}).`,
    };
  }

  if (head.version === baseVersion) {
    return {
      ok: false,
      reason: "not-bumped",
      message:
        `App-shell files changed but the PWA version is still ${baseVersion}.\n` +
        `Changed app-shell files:\n` +
        changedAppShellFiles.map((f) => `  - ${f}`).join("\n") +
        `\n\n${REMEDIATION}`,
    };
  }

  return {
    ok: true,
    reason: "bumped",
    message:
      `App-shell changed and version bumped from ${baseVersion} to ${head.version}.`,
  };
}
