// Unit tests for the CycloneDX SBOM generator (issue #111, SCR-SBOM).
//
// The GRQ FX Validation Dashboard is a continuously-deployed PWA, but
// nothing produced a Software Bill of Materials describing what is
// actually shipped. scripts/gen-sbom.ts derives a CycloneDX SBOM from
// the locked Deno dependency tree (deno.lock) and the CDN libraries
// referenced from docs/. These tests call the real generator functions
// with representative inputs and assert on the resulting CycloneDX
// document so the inventory stays faithful to what is deployed.
//
// Australian English: behaviour, organisation, licence.

import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  buildSbom,
  cdnUrlIdentity,
  denoModuleIdentity,
  extractVersion,
  mergeComponents,
  parseCdnComponents,
  parseDenoLockComponents,
  sriToHash,
} from "../scripts/gen-sbom.ts";

// --------------------------------------------------------------------
// denoModuleIdentity
// --------------------------------------------------------------------

Deno.test("denoModuleIdentity - extracts pkg and version from a std URL", () => {
  const id = denoModuleIdentity(
    "https://deno.land/std@0.208.0/path/mod.ts",
  );
  assertExists(id);
  assertEquals(id.name, "deno.land/std");
  assertEquals(id.version, "0.208.0");
  assertEquals(id.baseUrl, "https://deno.land/std@0.208.0/");
});

Deno.test("denoModuleIdentity - keeps multi-segment package paths", () => {
  const id = denoModuleIdentity("https://deno.land/x/foo@1.2.3/lib/mod.ts");
  assertExists(id);
  assertEquals(id.name, "deno.land/x/foo");
  assertEquals(id.version, "1.2.3");
});

Deno.test("denoModuleIdentity - returns null for an unversioned URL", () => {
  assertEquals(denoModuleIdentity("https://example.com/no/version.ts"), null);
});

// --------------------------------------------------------------------
// parseDenoLockComponents
// --------------------------------------------------------------------

Deno.test("parseDenoLockComponents - collapses many files to one component per version", () => {
  const lock = {
    version: "5",
    remote: {
      "https://deno.land/std@0.208.0/path/mod.ts": "aaa",
      "https://deno.land/std@0.208.0/assert/mod.ts": "bbb",
      "https://deno.land/std@0.208.0/fmt/colors.ts": "ccc",
    },
  };
  const comps = parseDenoLockComponents(lock);
  assertEquals(comps.length, 1);
  const std = comps[0];
  assertEquals(std.type, "library");
  assertEquals(std.name, "deno.land/std");
  assertEquals(std.version, "0.208.0");
  assertEquals(std["bom-ref"], "deno.land/std@0.208.0");
  assertExists(std.externalReferences);
  assertEquals(
    std.externalReferences?.[0].url,
    "https://deno.land/std@0.208.0/",
  );
});

Deno.test("parseDenoLockComponents - tolerates a missing remote section", () => {
  assertEquals(parseDenoLockComponents({ version: "5" }), []);
  assertEquals(parseDenoLockComponents({}), []);
});

Deno.test("parseDenoLockComponents - separates distinct package versions", () => {
  // Uses deno.land/x/<pkg> rather than std so the lockfile-integrity
  // scanner (tests/deno-lock-integrity.test.js) does not mistake these
  // fixtures for real, unpinned std imports.
  const lock = {
    remote: {
      "https://deno.land/x/widget@0.208.0/path/mod.ts": "a",
      "https://deno.land/x/widget@0.224.0/path/mod.ts": "b",
    },
  };
  const comps = parseDenoLockComponents(lock);
  assertEquals(comps.length, 2);
  assertEquals(comps.map((c) => c.version).sort(), ["0.208.0", "0.224.0"]);
});

// --------------------------------------------------------------------
// sriToHash
// --------------------------------------------------------------------

Deno.test("sriToHash - converts a base64 SRI digest to a hex CycloneDX hash", () => {
  // "abc" SHA-384 digest, base64-encoded, is a well-known value.
  const integrity =
    "sha384-ywB1P0WjXou1oD4KJBQYLZUNn5JqQGyG/uXFxkEfBs9ZHmJ6m0Yei5pjQI7+vIxL";
  const hash = sriToHash(integrity);
  assertExists(hash);
  assertEquals(hash.alg, "SHA-384");
  // Hex digest is twice the digest length (48 bytes -> 96 hex chars).
  assertEquals(hash.content.length, 96);
  assert(/^[0-9a-f]+$/.test(hash.content));
});

Deno.test("sriToHash - returns null for an unrecognised algorithm", () => {
  assertEquals(sriToHash("md5-deadbeef"), null);
  assertEquals(sriToHash(""), null);
});

// --------------------------------------------------------------------
// cdnUrlIdentity
// --------------------------------------------------------------------

Deno.test("cdnUrlIdentity - parses a jsDelivr npm URL", () => {
  const id = cdnUrlIdentity(
    "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
  );
  assertExists(id);
  assertEquals(id.name, "bootstrap");
  assertEquals(id.version, "5.3.3");
});

Deno.test("cdnUrlIdentity - parses a scoped jsDelivr package", () => {
  const id = cdnUrlIdentity(
    "https://cdn.jsdelivr.net/npm/@scope/widget@2.0.0/dist/w.js",
  );
  assertExists(id);
  assertEquals(id.name, "@scope/widget");
  assertEquals(id.version, "2.0.0");
});

Deno.test("cdnUrlIdentity - parses cdnjs and unpkg URLs", () => {
  const cdnjs = cdnUrlIdentity(
    "https://cdnjs.cloudflare.com/ajax/libs/chart.js/4.5.0/chart.umd.min.js",
  );
  assertEquals(cdnjs?.name, "chart.js");
  assertEquals(cdnjs?.version, "4.5.0");

  const unpkg = cdnUrlIdentity("https://unpkg.com/dayjs@1.11.0/dayjs.min.js");
  assertEquals(unpkg?.name, "dayjs");
  assertEquals(unpkg?.version, "1.11.0");
});

Deno.test("cdnUrlIdentity - ignores a non-CDN URL", () => {
  assertEquals(cdnUrlIdentity("https://example.com/app.js"), null);
});

// --------------------------------------------------------------------
// parseCdnComponents
// --------------------------------------------------------------------

Deno.test("parseCdnComponents - pairs a script tag with its SRI integrity", () => {
  const html = `
    <link rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
      integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH"
      crossorigin="anonymous">
    <script
      src="https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js"
      integrity="sha384-XcdcwHqIPULERb2yDEM4R0XaQKU3YnDsrTmjACBZyfdVVqjh6xQ4/DCMd7XLcA6Y"></script>
  `;
  const comps = parseCdnComponents(html);
  assertEquals(comps.length, 2);
  const bootstrap = comps.find((c) => c.name === "bootstrap");
  assertExists(bootstrap);
  assertEquals(bootstrap.version, "5.3.3");
  assertEquals(bootstrap.purl, "pkg:npm/bootstrap@5.3.3");
  assertExists(bootstrap.hashes);
  assertEquals(bootstrap.hashes?.[0].alg, "SHA-384");
  assert(/^[0-9a-f]{96}$/.test(bootstrap.hashes![0].content));
});

Deno.test("parseCdnComponents - finds bare URLs without integrity", () => {
  const sw = `
    const ASSETS = [
      "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
      "/index.html",
    ];
  `;
  const comps = parseCdnComponents(sw);
  assertEquals(comps.length, 1);
  assertEquals(comps[0].name, "bootstrap");
  assertEquals(comps[0].version, "5.3.3");
});

// --------------------------------------------------------------------
// mergeComponents
// --------------------------------------------------------------------

Deno.test("mergeComponents - dedupes by ref and keeps the entry with hashes", () => {
  const withHash = {
    type: "library",
    name: "bootstrap",
    version: "5.3.3",
    purl: "pkg:npm/bootstrap@5.3.3",
    "bom-ref": "pkg:npm/bootstrap@5.3.3",
    hashes: [{ alg: "SHA-384", content: "abc" }],
  };
  const noHash = {
    type: "library",
    name: "bootstrap",
    version: "5.3.3",
    purl: "pkg:npm/bootstrap@5.3.3",
    "bom-ref": "pkg:npm/bootstrap@5.3.3",
  };
  const merged = mergeComponents([noHash], [withHash]);
  assertEquals(merged.length, 1);
  assertExists(merged[0].hashes);
});

// --------------------------------------------------------------------
// extractVersion
// --------------------------------------------------------------------

Deno.test("extractVersion - reads the VERSION constant from index.js", () => {
  assertEquals(extractVersion('const VERSION = "1.0.110";'), "1.0.110");
  assertEquals(extractVersion("const VERSION = '2.3.4';"), "2.3.4");
});

Deno.test("extractVersion - falls back when no VERSION is present", () => {
  assertEquals(extractVersion("no version here", "0.0.0"), "0.0.0");
});

// --------------------------------------------------------------------
// buildSbom (integration of the parts)
// --------------------------------------------------------------------

Deno.test("buildSbom - produces a valid CycloneDX document", () => {
  const lock = {
    remote: {
      "https://deno.land/std@0.208.0/path/mod.ts": "a",
      "https://deno.land/std@0.208.0/assert/mod.ts": "b",
    },
  };
  const html = `
    <script
      src="https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js"
      integrity="sha384-XcdcwHqIPULERb2yDEM4R0XaQKU3YnDsrTmjACBZyfdVVqjh6xQ4/DCMd7XLcA6Y"></script>
  `;
  const sbom = buildSbom({
    application: { name: "grq-fx-validation-dashboard", version: "1.0.110" },
    denoLock: lock,
    cdnSources: [html],
    timestamp: "2026-06-12T00:00:00.000Z",
  });

  assertEquals(sbom.bomFormat, "CycloneDX");
  assertEquals(sbom.specVersion, "1.5");
  assertEquals(sbom.version, 1);
  assertEquals(sbom.metadata.timestamp, "2026-06-12T00:00:00.000Z");
  assertEquals(sbom.metadata.component.name, "grq-fx-validation-dashboard");
  assertEquals(sbom.metadata.component.version, "1.0.110");
  assertEquals(sbom.metadata.component.type, "application");
  // The tool that generated the SBOM is recorded for provenance.
  assert(sbom.metadata.tools.some((t) => t.name === "gen-sbom.ts"));

  // One deno_std component + one CDN component.
  assertEquals(sbom.components.length, 2);
  const names = sbom.components.map((c) => c.name).sort();
  assertEquals(names, ["chart.js", "deno.land/std"]);

  // Every component carries a stable bom-ref so the SBOM diffs cleanly.
  for (const c of sbom.components) {
    assert(typeof c["bom-ref"] === "string" && c["bom-ref"].length > 0);
  }
});

Deno.test("buildSbom - components are sorted deterministically by bom-ref", () => {
  const lock = {
    remote: { "https://deno.land/std@0.208.0/path/mod.ts": "a" },
  };
  const html = `
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.0/x.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/x.css">
  `;
  const a = buildSbom({
    application: { name: "app", version: "1" },
    denoLock: lock,
    cdnSources: [html],
    timestamp: "2026-06-12T00:00:00.000Z",
  });
  const b = buildSbom({
    application: { name: "app", version: "1" },
    denoLock: lock,
    cdnSources: [html],
    timestamp: "2026-06-12T00:00:00.000Z",
  });
  assertEquals(
    a.components.map((c) => c["bom-ref"]),
    b.components.map((c) => c["bom-ref"]),
  );
  const refs = a.components.map((c) => c["bom-ref"]);
  assertEquals([...refs].sort(), refs);
});
