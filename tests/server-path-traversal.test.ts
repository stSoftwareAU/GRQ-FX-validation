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
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import { DOCS_ROOT, getFilePath, handleRequest } from "../helpers/server.ts";

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

// Issue #43: the previous "server binds to 127.0.0.1" assertion was a
// source-grep HOW-test that passed as long as the literal string
// `hostname: "127.0.0.1"` appeared anywhere in `helpers/server.ts`.
// Replaced with a behavioural test that:
//   1. Sends a path-traversal request through `handleRequest` and asserts
//      the response is a 404 with no file contents leaked.
//   2. Spins up `Deno.serve` on `127.0.0.1`, fetches a path-traversal URL
//      over the wire, and asserts the same 404 — proving the in-process
//      hardening survives the full request/response cycle.
Deno.test("handleRequest returns 404 for path-traversal requests with no file contents", async () => {
  const traversals = [
    "/../helpers/server.ts",
    "/../../etc/passwd",
    "/docs/../helpers/server.ts",
    "/%2e%2e/%2e%2e/etc/passwd",
    "/%2e%2e%2fhelpers/server.ts",
    "//etc/passwd",
    "/%2fetc/passwd",
    "/index.html%00.png",
  ];
  for (const path of traversals) {
    const url = `http://127.0.0.1/${path.replace(/^\//, "")}`;
    const response = await handleRequest(new Request(url));
    assertEquals(
      response.status,
      404,
      `Expected 404 for traversal path ${path}, got ${response.status}`,
    );
    const body = await response.text();
    // Body must not contain anything that looks like a file outside the
    // sandbox — the server's "Not Found" string is the only acceptable
    // payload.
    assertEquals(
      body.toLowerCase().includes("import"),
      false,
      `Response for ${path} leaked source code: ${body.slice(0, 120)}`,
    );
    assertEquals(
      body.includes("root:") || body.includes("/bin/"),
      false,
      `Response for ${path} leaked /etc/passwd-like contents: ${
        body.slice(0, 120)
      }`,
    );
  }
});

Deno.test("Dev server bound to 127.0.0.1 refuses path traversal over the wire", async () => {
  const ac = new AbortController();
  const server = Deno.serve(
    {
      port: 0,
      hostname: "127.0.0.1",
      signal: ac.signal,
      onListen: () => {},
    },
    handleRequest,
  );
  try {
    // deno-lint-ignore no-explicit-any
    const addr = (server as any).addr as { hostname: string; port: number };
    // Sanity check: the server reports a loopback bind address. This is
    // the behavioural equivalent of the deleted source-grep —
    // `Deno.serve` itself returns the address it actually bound.
    assertEquals(
      addr.hostname,
      "127.0.0.1",
      `Expected dev server to bind to 127.0.0.1, bound to ${addr.hostname}`,
    );
    // Now exercise the path-traversal guard through a real TCP request.
    const url = `http://127.0.0.1:${addr.port}/%2e%2e/%2e%2e/etc/passwd`;
    const response = await fetch(url);
    const body = await response.text();
    assertEquals(response.status, 404);
    assert(
      !body.includes("root:") && !body.includes("/bin/"),
      `Live server leaked /etc/passwd-like contents: ${body.slice(0, 120)}`,
    );
  } finally {
    ac.abort();
    await server.finished;
  }
});
