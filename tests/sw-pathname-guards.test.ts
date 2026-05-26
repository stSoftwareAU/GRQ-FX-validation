// Service worker pathname-guard regression tests (WHAT, not HOW).
//
// Australian English: these tests previously read `docs/sw.js` as text
// and grep'd it for regex literals — a HOW-test that breaks when the
// implementation moves while the dashboard remains correct. Issue #43:
// rewritten to load `docs/sw.js` into a mocked Service Worker
// environment, dispatch synthetic fetch events, and assert on the
// observable strategy each request actually receives (network-first,
// network-only, cache-first).
//
// Strategy fingerprints we rely on (all observable side effects, not
// source text):
//   • `fetch(req)` with `req.cache === "no-store"`  → dynamic / data file
//     (CSV under /data/ or dated predictions.json).
//   • `fetch(req)` with `req.cache !== "no-store"`  → static asset path.
//   • `caches.match(req)` consulted first           → cache-first.
//   • Network attempted first, cache only on error  → network-first.
//
// Date: 27-May-2026

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

interface FetchCall {
  url: string;
  // We capture the `cache` option the SW passed to the Request
  // constructor. Deno's native Request does not expose `.cache`, so we
  // wrap the constructor ourselves to record what was requested — that
  // is the observable signal that distinguishes "no-store"
  // (network-only / network-first) from default static-asset fetches.
  cache: string | undefined;
}

interface DispatchResult {
  response: Response | null;
  fetchCalls: FetchCall[];
  cacheMatchUrls: string[];
}

const ORIGIN = "https://example.test";

async function loadFetchHandler(): Promise<
  // deno-lint-ignore no-explicit-any
  (ev: any) => void
> {
  const src = await Deno.readTextFile(new URL("../docs/sw.js", import.meta.url));

  // deno-lint-ignore no-explicit-any
  const handlers: Record<string, Array<(ev: any) => void>> = {};

  const fakeSelf = {
    // deno-lint-ignore no-explicit-any
    addEventListener: (type: string, fn: (ev: any) => void) => {
      (handlers[type] ||= []).push(fn);
    },
    skipWaiting: () => Promise.resolve(),
    clients: {
      claim: () => Promise.resolve(),
      matchAll: async () => [],
    },
    registration: { showNotification: () => Promise.resolve() },
  };

  const fakeConsole = { log: () => {}, warn: () => {}, error: () => {} };
  const installTimeCaches = {
    open: async () => ({
      addAll: async (_: string[]) => {},
      put: async () => {},
      match: async () => undefined,
      keys: async () => [],
    }),
    keys: async () => [],
    match: async () => undefined,
    delete: async () => true,
  };
  const installTimeLocation = { origin: ORIGIN };
  const installTimeFetch = (_: RequestInfo | URL) =>
    Promise.resolve(new Response(""));

  // Inject every global the SW touches as a Function parameter so we do
  // not need to mutate the real globalThis. The SW source then runs as
  // if it were inside this isolated worker scope.
  const factory = new Function(
    "self",
    "caches",
    "fetch",
    "location",
    "console",
    "Request",
    "Response",
    "Headers",
    "URL",
    src,
  );
  factory(
    fakeSelf,
    installTimeCaches,
    installTimeFetch,
    installTimeLocation,
    fakeConsole,
    Request,
    Response,
    Headers,
    URL,
  );

  const fetchHandlers = handlers["fetch"] ?? [];
  if (fetchHandlers.length === 0) {
    throw new Error("sw.js did not register a fetch handler");
  }
  return fetchHandlers[0];
}

// Dispatch a synthetic fetch event against a freshly-loaded SW. Each
// dispatch builds its own mocks so call ledgers do not bleed between
// tests.
async function dispatchFetch(
  url: string,
  options: { failNetwork?: boolean; method?: string } = {},
): Promise<DispatchResult> {
  // The SW closure captures the `caches`, `fetch`, and `location`
  // references it was loaded with, so we re-load it per dispatch with
  // mocks that record the calls we want to observe.
  const src = await Deno.readTextFile(new URL("../docs/sw.js", import.meta.url));

  const fetchCalls: FetchCall[] = [];
  const cacheMatchUrls: string[] = [];
  const cacheStore = new Map<string, Response>();

  const fakeCache = {
    addAll: async (_urls: string[]) => {},
    // deno-lint-ignore no-explicit-any
    put: async (req: any, res: Response) => {
      const key = typeof req === "string" ? req : req.url;
      cacheStore.set(key, res);
    },
    // deno-lint-ignore no-explicit-any
    match: async (req: any) => {
      const key = typeof req === "string" ? req : req.url;
      cacheMatchUrls.push(key);
      return cacheStore.get(key);
    },
    keys: async () => [],
  };

  const fakeCaches = {
    open: async (_name: string) => fakeCache,
    // deno-lint-ignore no-explicit-any
    match: async (req: any) => {
      const key = typeof req === "string" ? req : req.url;
      cacheMatchUrls.push(key);
      return cacheStore.get(key);
    },
    keys: async () => [],
    delete: async (_name: string) => true,
  };

  // Wrap Request so we can observe the `cache` option the SW passed —
  // Deno's native Request does not expose `.cache`. The wrapper records
  // the cache mode on a side-channel WeakMap keyed by the Request, so
  // when sw.js later passes the Request to fetch(), we can retrieve it.
  const cacheModes = new WeakMap<Request, string | undefined>();
  const RecordingRequest = function (
    this: unknown,
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Request {
    const req = new Request(input as RequestInfo | URL, init);
    let mode: string | undefined = init?.cache;
    if (mode === undefined && input instanceof Request) {
      mode = cacheModes.get(input);
    }
    cacheModes.set(req, mode);
    return req;
  } as unknown as typeof Request;

  const fakeFetch = (input: RequestInfo | URL) => {
    const req = input instanceof Request
      ? input
      : new Request(input as RequestInfo | URL);
    fetchCalls.push({ url: req.url, cache: cacheModes.get(req) });
    if (options.failNetwork) {
      return Promise.reject(new Error("network failure (test)"));
    }
    return Promise.resolve(
      new Response("ok", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    );
  };

  const fakeLocation = { origin: ORIGIN };
  const fakeConsole = { log: () => {}, warn: () => {}, error: () => {} };

  // deno-lint-ignore no-explicit-any
  const handlers: Record<string, Array<(ev: any) => void>> = {};
  const fakeSelf = {
    // deno-lint-ignore no-explicit-any
    addEventListener: (type: string, fn: (ev: any) => void) => {
      (handlers[type] ||= []).push(fn);
    },
    skipWaiting: () => Promise.resolve(),
    clients: {
      claim: () => Promise.resolve(),
      matchAll: async () => [],
    },
    registration: { showNotification: () => Promise.resolve() },
  };

  const factory = new Function(
    "self",
    "caches",
    "fetch",
    "location",
    "console",
    "Request",
    "Response",
    "Headers",
    "URL",
    src,
  );
  factory(
    fakeSelf,
    fakeCaches,
    fakeFetch,
    fakeLocation,
    fakeConsole,
    RecordingRequest,
    Response,
    Headers,
    URL,
  );

  const fetchHandlers = handlers["fetch"] ?? [];
  if (fetchHandlers.length === 0) {
    throw new Error("sw.js did not register a fetch handler");
  }

  const request = new Request(url, { method: options.method ?? "GET" });
  cacheModes.set(request, undefined);
  let captured: Response | Promise<Response> | null = null;
  const event = {
    request,
    respondWith: (r: Response | Promise<Response>) => {
      captured = r;
    },
    waitUntil: (_p: Promise<unknown>) => {},
  };

  for (const fn of fetchHandlers) fn(event);

  let response: Response | null = null;
  if (captured !== null) {
    try {
      response = await Promise.resolve(captured);
    } catch {
      response = null;
    }
  }
  return { response, fetchCalls, cacheMatchUrls };
}

// Smoke-test the harness itself: the SW must register a fetch listener.
Deno.test("sw.js registers a fetch event listener on install", async () => {
  const handler = await loadFetchHandler();
  assertEquals(typeof handler, "function");
});

Deno.test("sw.js routes CSV data files under /data/ to network-only with cache: no-store", async () => {
  const { fetchCalls, cacheMatchUrls } = await dispatchFetch(
    `${ORIGIN}/data/AUDUSD-current.csv`,
  );
  assertEquals(fetchCalls.length, 1, "expected exactly one network fetch");
  assertEquals(
    fetchCalls[0].cache,
    "no-store",
    "CSV data files must be fetched with cache: 'no-store' so the dashboard cannot serve stale validation data",
  );
  assertEquals(
    cacheMatchUrls.length,
    0,
    "CSV data files must NOT consult the cache first (network-only strategy)",
  );
});

Deno.test("sw.js routes dated predictions.json to network-only with cache: no-store", async () => {
  const { fetchCalls, cacheMatchUrls } = await dispatchFetch(
    `${ORIGIN}/2025-07-27/predictions.json`,
  );
  assertEquals(fetchCalls.length, 1);
  assertEquals(
    fetchCalls[0].cache,
    "no-store",
    "Dated predictions.json must be fetched with cache: 'no-store'",
  );
  assertEquals(cacheMatchUrls.length, 0);
});

Deno.test("sw.js routes /index.json as network-first (network attempted, cache only on failure)", async () => {
  const { fetchCalls, cacheMatchUrls } = await dispatchFetch(
    `${ORIGIN}/index.json`,
  );
  assertEquals(
    fetchCalls.length,
    1,
    "index.json must hit the network on every request",
  );
  assertEquals(
    fetchCalls[0].cache,
    "no-store",
    "index.json must be re-fetched bypassing HTTP cache so the date dropdown stays current",
  );
  // Network succeeded, so cache lookup is not required.
  assertEquals(cacheMatchUrls.length, 0);
});

Deno.test("sw.js routes /index.json falls back to the cache when the network fails", async () => {
  const { fetchCalls, cacheMatchUrls } = await dispatchFetch(
    `${ORIGIN}/index.json`,
    { failNetwork: true },
  );
  assertEquals(fetchCalls.length, 1, "network must be attempted first");
  assert(
    cacheMatchUrls.length > 0,
    "cache must be consulted after the network fails",
  );
});

Deno.test("sw.js routes static .js assets cache-first", async () => {
  const { fetchCalls, cacheMatchUrls } = await dispatchFetch(
    `${ORIGIN}/index.js`,
  );
  assert(
    cacheMatchUrls.length > 0,
    "static .js assets must consult the cache before the network",
  );
  // On cache miss the SW falls through to the network; the cache call
  // must happen first.
  for (const call of fetchCalls) {
    assert(
      call.cache !== "no-store",
      `static .js fallback fetch must not pass cache: 'no-store' (got ${call.cache})`,
    );
  }
});

Deno.test("sw.js routes static .json assets (e.g. manifest.json) cache-first, not network-only", async () => {
  const { fetchCalls, cacheMatchUrls } = await dispatchFetch(
    `${ORIGIN}/manifest.json`,
  );
  assert(
    cacheMatchUrls.length > 0,
    "manifest.json must consult the cache first — it is not a data file",
  );
  for (const call of fetchCalls) {
    assert(
      call.cache !== "no-store",
      `static .json must not be fetched with cache: 'no-store' (got ${call.cache})`,
    );
  }
});

Deno.test("sw.js ignores cross-origin requests outside the cdn.jsdelivr.net allowlist", async () => {
  const { response, fetchCalls, cacheMatchUrls } = await dispatchFetch(
    "https://malicious.example/steal",
  );
  assertEquals(
    response,
    null,
    "cross-origin requests must be left to the browser (no respondWith)",
  );
  assertEquals(fetchCalls.length, 0);
  assertEquals(cacheMatchUrls.length, 0);
});

Deno.test("sw.js ignores non-GET requests (POST is left to the browser)", async () => {
  const { response, fetchCalls, cacheMatchUrls } = await dispatchFetch(
    `${ORIGIN}/index.json`,
    { method: "POST" },
  );
  assertEquals(response, null);
  assertEquals(fetchCalls.length, 0);
  assertEquals(cacheMatchUrls.length, 0);
});
