#!/usr/bin/env -S deno run --allow-read --allow-write
// CycloneDX SBOM generator for the GRQ FX Validation Dashboard.
//
// Issue #111 (SCR-SBOM): the dashboard is a continuously-deployed PWA but
// nothing produced a Software Bill of Materials describing what is
// shipped to the live GitHub Pages instance. When a supply-chain
// advisory lands, the first question during incident response is "which
// version did we deploy?". This script answers that by deriving a
// CycloneDX 1.5 SBOM from the two real dependency surfaces:
//
//   1. The locked Deno dependency tree (deno.lock) — the std modules that
//      back the dev server and the test suite.
//   2. The CDN-loaded browser libraries (Bootstrap, Chart.js, the
//      date-fns adapter) referenced from docs/index.html and docs/sw.js,
//      including their Subresource Integrity (SRI) digests.
//
// Run it with:
//   deno run --allow-read --allow-write scripts/gen-sbom.ts
//
// The exported helpers are pure so they can be unit-tested directly (see
// tests/gen-sbom.test.ts). Australian English: behaviour, organisation,
// licence.

// --------------------------------------------------------------------
// Types
// --------------------------------------------------------------------

export interface Hash {
  alg: string;
  content: string;
}

export interface ExternalReference {
  type: string;
  url: string;
}

export interface Component {
  type: string;
  name: string;
  version: string;
  purl?: string;
  "bom-ref": string;
  hashes?: Hash[];
  externalReferences?: ExternalReference[];
}

export interface Tool {
  vendor: string;
  name: string;
  version: string;
}

export interface Sbom {
  bomFormat: string;
  specVersion: string;
  version: number;
  metadata: {
    timestamp: string;
    tools: Tool[];
    component: {
      type: string;
      name: string;
      version: string;
      "bom-ref": string;
    };
  };
  components: Component[];
}

export interface DenoModuleId {
  name: string;
  version: string;
  baseUrl: string;
}

export interface CdnId {
  name: string;
  version: string;
}

// --------------------------------------------------------------------
// Deno lock parsing
// --------------------------------------------------------------------

// Derive a package identity from a locked Deno module URL such as
// `https://deno.land/std@0.208.0/path/mod.ts`. Returns null when the URL
// carries no `@version` token (we cannot pin an unversioned import).
export function denoModuleIdentity(url: string): DenoModuleId | null {
  const m = url.match(/^https?:\/\/([^/]+)\/(.+?)@([^/]+)(?:\/|$)/);
  if (!m) return null;
  const [, host, pkg, version] = m;
  return {
    name: `${host}/${pkg}`,
    version,
    baseUrl: `https://${host}/${pkg}@${version}/`,
  };
}

// Collapse the hundreds of per-file entries under deno.lock's `remote`
// section into one component per distinct package version.
export function parseDenoLockComponents(lock: unknown): Component[] {
  const remote = (lock as { remote?: Record<string, unknown> })?.remote ?? {};
  const seen = new Map<string, Component>();
  for (const url of Object.keys(remote)) {
    const id = denoModuleIdentity(url);
    if (!id) continue;
    const ref = `${id.name}@${id.version}`;
    if (seen.has(ref)) continue;
    seen.set(ref, {
      type: "library",
      name: id.name,
      version: id.version,
      "bom-ref": ref,
      externalReferences: [{ type: "distribution", url: id.baseUrl }],
    });
  }
  return [...seen.values()];
}

// --------------------------------------------------------------------
// Subresource Integrity → CycloneDX hash
// --------------------------------------------------------------------

const SRI_ALG: Record<string, string> = {
  sha256: "SHA-256",
  sha384: "SHA-384",
  sha512: "SHA-512",
};

function base64ToHex(b64: string): string {
  const bin = atob(b64);
  let hex = "";
  for (let i = 0; i < bin.length; i++) {
    hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

// Convert an SRI attribute (`sha384-<base64>`) into a CycloneDX hash with
// a hex-encoded digest. Uses the first token when several are present.
export function sriToHash(integrity: string): Hash | null {
  const first = (integrity ?? "").trim().split(/\s+/)[0] ?? "";
  const m = first.match(/^(sha256|sha384|sha512)-(.+)$/);
  if (!m) return null;
  try {
    return { alg: SRI_ALG[m[1]], content: base64ToHex(m[2]) };
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------
// CDN library parsing
// --------------------------------------------------------------------

// Match the three CDN hosts the dashboard and its Renovate custom
// managers track. The npm name may be scoped (`@scope/pkg`).
const CDN_PATTERNS: RegExp[] = [
  /https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[^/]+\/)?[^@/"'\s]+)@([^/"'\s]+)/,
  /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/([^/"'\s]+)\/([^/"'\s]+)/,
  /https:\/\/unpkg\.com\/((?:@[^/]+\/)?[^@/"'\s]+)@([^/"'\s]+)/,
];

export function cdnUrlIdentity(url: string): CdnId | null {
  for (const re of CDN_PATTERNS) {
    const m = url.match(re);
    if (m) return { name: m[1], version: m[2] };
  }
  return null;
}

function cdnComponent(id: CdnId, hash: Hash | null): Component {
  const ref = `pkg:npm/${id.name}@${id.version}`;
  const comp: Component = {
    type: "library",
    name: id.name,
    version: id.version,
    purl: ref,
    "bom-ref": ref,
  };
  if (hash) comp.hashes = [hash];
  return comp;
}

// Extract CDN library components from a source blob (HTML or JS). The
// HTML pass pairs each <script>/<link> tag with its SRI integrity; a
// second pass picks up bare CDN URLs (e.g. the service worker's
// pre-cache list) that carry no integrity attribute.
export function parseCdnComponents(text: string): Component[] {
  const found: Component[][] = [];

  // Tag-aware pass: associate a URL with the integrity in the same tag.
  for (const tag of text.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
    const url = tag.match(/(?:src|href)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!url) continue;
    const id = cdnUrlIdentity(url);
    if (!id) continue;
    const integrity = tag.match(/integrity\s*=\s*["']([^"']+)["']/i)?.[1];
    found.push([cdnComponent(id, integrity ? sriToHash(integrity) : null)]);
  }

  // Bare-URL pass: every CDN URL anywhere in the text, without hashes.
  const bare: Component[] = [];
  for (const re of CDN_PATTERNS) {
    const global = new RegExp(re.source, "g");
    for (const m of text.matchAll(global)) {
      bare.push(cdnComponent({ name: m[1], version: m[2] }, null));
    }
  }
  found.push(bare);

  return mergeComponents(...found);
}

// --------------------------------------------------------------------
// Merge + assemble
// --------------------------------------------------------------------

// Deduplicate components by bom-ref. When the same component appears more
// than once, prefer the entry that carries hash data.
export function mergeComponents(...lists: Component[][]): Component[] {
  const byRef = new Map<string, Component>();
  for (const list of lists) {
    for (const comp of list) {
      const ref = comp["bom-ref"];
      const existing = byRef.get(ref);
      if (!existing) {
        byRef.set(ref, comp);
      } else if (!existing.hashes && comp.hashes) {
        byRef.set(ref, comp);
      }
    }
  }
  return [...byRef.values()];
}

function byRef(a: Component, b: Component): number {
  return a["bom-ref"] < b["bom-ref"] ? -1 : a["bom-ref"] > b["bom-ref"] ? 1 : 0;
}

export interface BuildOptions {
  application: { name: string; version: string };
  denoLock: unknown;
  cdnSources: string[];
  timestamp: string;
}

// Assemble a CycloneDX 1.5 document from the locked Deno tree and the CDN
// sources. Components are sorted by bom-ref so regenerating the SBOM
// produces a stable, diff-friendly artefact.
export function buildSbom(opts: BuildOptions): Sbom {
  const denoComps = parseDenoLockComponents(opts.denoLock);
  const cdnComps = mergeComponents(...opts.cdnSources.map(parseCdnComponents));
  const components = [...cdnComps, ...denoComps].sort(byRef);

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      timestamp: opts.timestamp,
      tools: [
        {
          vendor: "stSoftwareAU",
          name: "gen-sbom.ts",
          version: "1.0.0",
        },
      ],
      component: {
        type: "application",
        name: opts.application.name,
        version: opts.application.version,
        "bom-ref": `${opts.application.name}@${opts.application.version}`,
      },
    },
    components,
  };
}

// Pull the published PWA build version out of docs/index.js's
// `const VERSION = "x.y.z";` declaration; fall back when absent.
export function extractVersion(source: string, fallback = "0.0.0"): string {
  return source.match(/const\s+VERSION\s*=\s*["']([^"']+)["']/)?.[1] ?? fallback;
}

// --------------------------------------------------------------------
// CLI entry point
// --------------------------------------------------------------------

async function readMaybe(path: string): Promise<string> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return "";
  }
}

export async function main(
  root = new URL("..", import.meta.url).pathname,
  outFile = "sbom.cdx.json",
): Promise<Sbom> {
  const lockText = await readMaybe(`${root}deno.lock`);
  const denoLock = lockText ? JSON.parse(lockText) : {};
  const cdnSources = await Promise.all([
    readMaybe(`${root}docs/index.html`),
    readMaybe(`${root}docs/sw.js`),
  ]);
  const version = extractVersion(await readMaybe(`${root}docs/index.js`));

  const sbom = buildSbom({
    application: { name: "grq-fx-validation-dashboard", version },
    denoLock,
    cdnSources,
    timestamp: new Date().toISOString(),
  });

  await Deno.writeTextFile(outFile, `${JSON.stringify(sbom, null, 2)}\n`);
  console.log(
    `[gen-sbom] Wrote ${outFile}: ${sbom.components.length} components ` +
      `(application ${sbom.metadata.component.version}).`,
  );
  return sbom;
}

if (import.meta.main) {
  await main();
}
