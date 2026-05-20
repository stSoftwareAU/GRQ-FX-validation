// Path-traversal regression tests for helpers/server.ts.
//
// Australian English: these tests verify that requests cannot escape the
// `docs/` sandbox via `..` segments, URL-encoded `%2e%2e%2f`, absolute
// paths, or null-byte tricks. They guard issue #15 — a malicious page (or
// any LAN attacker, on older Deno releases) must not be able to read
// arbitrary files reachable by the dev-server's user account.
//
// Date: 21-May-2026

import { resolve } from "https://deno.land/std@0.208.0/path/mod.ts";
import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import { DOCS_ROOT, getFilePath } from "../helpers/server.ts";

Deno.test("getFilePath - root URL maps to docs/index.html", () => {
  const expected = resolve(DOCS_ROOT, "index.html");
  assertEquals(getFilePath("/"), expected);
});

Deno.test("getFilePath - empty path maps to docs/index.html", () => {
  const expected = resolve(DOCS_ROOT, "index.html");
  assertEquals(getFilePath(""), expected);
});

Deno.test("getFilePath - docs/ prefix is stripped", () => {
  const expected = resolve(DOCS_ROOT, "list.html");
  assertEquals(getFilePath("/docs/list.html"), expected);
});

Deno.test("getFilePath - nested data file resolves under docs", () => {
  const expected = resolve(DOCS_ROOT, "2025-07-27/predictions.json");
  assertEquals(getFilePath("/2025-07-27/predictions.json"), expected);
});

Deno.test("getFilePath - rejects parent-directory traversal", () => {
  assertEquals(getFilePath("/../helpers/server.ts"), null);
  assertEquals(getFilePath("/../../etc/passwd"), null);
  assertEquals(getFilePath("/docs/../helpers/server.ts"), null);
});

Deno.test("getFilePath - rejects URL-encoded parent-directory traversal", () => {
  // %2e%2e%2f decodes to ../
  assertEquals(getFilePath("/%2e%2e/%2e%2e/etc/passwd"), null);
  assertEquals(getFilePath("/%2e%2e%2fhelpers/server.ts"), null);
});

Deno.test("getFilePath - rejects absolute paths", () => {
  assertEquals(getFilePath("//etc/passwd"), null);
  assertEquals(getFilePath("/%2fetc/passwd"), null);
});

Deno.test("getFilePath - rejects null-byte injection", () => {
  // Null bytes are rejected outright — they are never valid in file paths
  // and have historically been used to bypass extension checks.
  assertEquals(getFilePath("/index.html%00.png"), null);
});

Deno.test("getFilePath - resolved path is contained within DOCS_ROOT", () => {
  // Sanity: any non-null result must be strictly inside the docs root.
  const samples = [
    "/",
    "/index.html",
    "/docs/list.html",
    "/2025-07-27/predictions.json",
  ];
  for (const url of samples) {
    const result = getFilePath(url);
    assertNotEquals(result, null, `expected ${url} to resolve`);
    if (result !== null) {
      // result must start with DOCS_ROOT + path separator OR equal DOCS_ROOT
      const prefix = DOCS_ROOT.endsWith("/") ? DOCS_ROOT : DOCS_ROOT + "/";
      if (!result.startsWith(prefix) && result !== DOCS_ROOT) {
        throw new Error(`${url} resolved outside DOCS_ROOT: ${result}`);
      }
    }
  }
});

Deno.test("server.ts source binds explicitly to 127.0.0.1", async () => {
  // Defence in depth: explicit loopback binding removes the LAN-exposure
  // variant on Deno releases prior to 1.35 (where the default was 0.0.0.0).
  const src = await Deno.readTextFile(
    new URL("../helpers/server.ts", import.meta.url),
  );
  if (!/hostname:\s*["']127\.0\.0\.1["']/.test(src)) {
    throw new Error(
      "Expected helpers/server.ts to pass hostname: '127.0.0.1' to Deno.serve",
    );
  }
});
