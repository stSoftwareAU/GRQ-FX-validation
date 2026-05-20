#!/usr/bin/env -S deno run --allow-net --allow-read
/**
 * Test Server for GRQ Validation Dashboard
 *
 * Starts a local HTTP server that serves static files
 * from the `docs` folder for testing.
 *
 * Usage:
 *   deno run --allow-net --allow-read helpers/server.ts [port]
 * Default port is 8000 if not specified.
 *
 * Security (issue #15): the server resolves every request path against an
 * absolute `docs/` root and rejects anything that escapes it (parent-dir
 * segments, URL-encoded `%2e%2e%2f`, absolute paths, null bytes, etc.).
 * It also binds explicitly to `127.0.0.1` so older Deno releases (<1.35,
 * where the default was `0.0.0.0`) cannot expose the test server to the
 * LAN.
 */

import {
  isAbsolute,
  join,
  relative,
  resolve,
} from "https://deno.land/std@0.208.0/path/mod.ts";

const DEFAULT_PORT = 8000;
const DOCS_DIR = "docs";

// Absolute, normalised path to the docs sandbox. Exported so tests can
// assert that every resolved file path stays under this root.
export const DOCS_ROOT = resolve(DOCS_DIR);

const DEBUG = true;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
};

export function getMimeType(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Resolve an incoming request URL to an absolute file path under
 * `DOCS_ROOT`, or `null` if the request escapes the sandbox.
 *
 * The caller MUST treat `null` as a 404 (or 403) — never read the file.
 */
export function getFilePath(url: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.substring(1));
  } catch {
    // Malformed percent-encoding — reject rather than guess.
    return null;
  }

  // Reject null bytes outright — they have historically been used to
  // bypass extension checks (e.g. `index.html%00.png`).
  if (decoded.includes("\0")) return null;

  // Reject absolute paths (e.g. `//etc/passwd`, `/%2fetc/passwd`).
  if (decoded.startsWith("/") || isAbsolute(decoded)) return null;

  let path = decoded;
  if (path === "" || path === "/") path = "index.html";
  else if (path === "docs" || path === "docs/") path = "index.html";
  else if (path === "index.html") path = "index.html";
  else if (path.startsWith("docs/")) {
    path = path.substring(5) || "index.html";
  }

  const fullPath = resolve(DOCS_ROOT, path);
  const rel = relative(DOCS_ROOT, fullPath);

  // Anything that resolves outside DOCS_ROOT either starts with `..` or
  // is itself absolute — both must be rejected.
  if (rel === "" || rel === ".") {
    // Resolved to DOCS_ROOT itself — treat as directory request.
    return join(DOCS_ROOT, "index.html");
  }
  if (rel.startsWith("..") || isAbsolute(rel)) return null;

  return fullPath;
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const filePath = getFilePath(url.pathname);

  if (DEBUG) {
    console.log(
      `\n📥 ${new Date().toISOString()} - ${request.method} ${url.pathname}`,
    );
  }

  if (filePath === null) {
    if (DEBUG) {
      console.log(
        `❌ 404 - Rejected path outside docs sandbox: ${url.pathname}`,
      );
    }
    return new Response("Not Found", { status: 404 });
  }

  try {
    const fileInfo = await Deno.stat(filePath);

    if (fileInfo.isFile) {
      const fileContent = await Deno.readFile(filePath);
      const mimeType = getMimeType(filePath);

      if (DEBUG) console.log(`✅ 200 - Served: ${filePath} (${mimeType})`);

      return new Response(fileContent, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
    }

    if (DEBUG) console.log(`❌ 404 - Not a file: ${filePath}`);
    return new Response("Not Found", { status: 404 });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      if (DEBUG) {
        console.log(`❌ 404 - File not found: ${filePath}`);
        console.log(`   Error: ${error.message}`);
      }
      return new Response("File Not Found", { status: 404 });
    }

    if (DEBUG) {
      console.log(`❌ 500 - Server error: ${filePath}`);
      console.log(`   Error: ${(error as Error).message}`);
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}

export { handleRequest };

if (import.meta.main) {
  const port = parseInt(Deno.args[0] ?? "") || DEFAULT_PORT;

  console.log(`🚀 Starting test server on http://127.0.0.1:${port}`);
  console.log(`📁 Serving files from: ${DOCS_ROOT}`);
  console.log(`🌐 Available URLs:`);
  console.log(`   • http://127.0.0.1:${port}/ (main dashboard)`);
  console.log(`   • http://127.0.0.1:${port}/docs/ (same as root)`);
  console.log(`   • http://127.0.0.1:${port}/index.html (explicit index)`);
  console.log(`   • http://127.0.0.1:${port}/scores/ (data files)`);
  console.log(`⏹️  Press Ctrl+C to stop the server`);
  console.log(`🔍 Debug logging is ${DEBUG ? "ENABLED" : "DISABLED"}`);
  console.log("");

  // Bind explicitly to loopback so older Deno releases (<1.35, default
  // 0.0.0.0) cannot expose the dev server to the LAN.
  Deno.serve({ port, hostname: "127.0.0.1" }, handleRequest);
}
