// Regression tests for the Yahoo Finance proxy allowlist (issues #24, #74).
//
// Australian English: the dashboard fans Yahoo Finance requests out through
// a list of third-party CORS proxies. The abandoned
// `thingproxy.freeboard.io` proxy must not appear in that list — its source
// project has been unmaintained since 2015 and a domain takeover would
// allow an attacker to inject arbitrary JSON into every dashboard visit.
//
// The CSP `connect-src` directive must also be kept in sync so the
// browser does not re-enable the dropped origin.
//
// Issue #74 rewrites the proxy-list checks. They used to regex the literal
// `this.proxies = [ … ]` array out of docs/index.js *source text* and assert
// on the extracted strings. Those HOW-tests broke on any behaviour-preserving
// refactor (building the list from config/env, spreading a shared constant,
// renaming `proxies`, changing quote style) even though the resolved proxy
// set was unchanged, and the count check conflated "inline string literals in
// source" with "operational proxies".
//
// They are now WHAT-tests. Following the repo's existing pattern
// (tests/dark-mode-emoji.test.js) we load the real YahooFinanceAPI class out
// of docs/index.js, instantiate it, and observe its behaviour: the resolved
// proxy list and — with `fetch` stubbed — the request URLs it actually issues.
// This survives any reimplementation of how the list is constructed and fails
// only on a real regression that re-enables the abandoned proxy.
//
// Date: 22-May-2026

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const INDEX_JS = path.join(REPO_ROOT, "docs", "index.js");
const INDEX_HTML = path.join(REPO_ROOT, "docs", "index.html");

const BANNED_PROXY_HOST = "thingproxy.freeboard.io";
const bannedHostRe = new RegExp(BANNED_PROXY_HOST.replace(/\./g, "\\."), "i");

function readIndexJs() {
  return fs.readFileSync(INDEX_JS, "utf8");
}

function readIndexHtml() {
  return fs.readFileSync(INDEX_HTML, "utf8");
}

// Extract the full `class YahooFinanceAPI { … }` declaration from the source
// so it can be instantiated in isolation. Brace-walks from the class header's
// first `{` to its matching `}`. This is harness code that LOCATES the
// production class to run — the assertions below are on the instantiated
// object's behaviour, not on this text.
function extractYahooFinanceAPIClass(src) {
  const start = src.indexOf("class YahooFinanceAPI");
  assert.notEqual(start, -1, "YahooFinanceAPI class not found in docs/index.js");
  let i = src.indexOf("{", start);
  assert.notEqual(i, -1, "YahooFinanceAPI opening brace not found");
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("YahooFinanceAPI closing brace not found");
}

// Build a runnable copy of the production YahooFinanceAPI class, injecting a
// `fetch` and `console` stub so request behaviour can be observed without
// touching the network. Executes the REAL source — not a regex over it.
function loadYahooFinanceAPI({ fetch, console: consoleStub } = {}) {
  const classText = extractYahooFinanceAPIClass(readIndexJs());
  const factory = new Function(
    "fetch",
    "console",
    `${classText}\nreturn YahooFinanceAPI;`,
  );
  const noopConsole = { log() {}, warn() {}, error() {}, info() {} };
  return factory(fetch, consoleStub ?? noopConsole);
}

test("YahooFinanceAPI resolved proxy list omits the abandoned thingproxy.freeboard.io", () => {
  const YahooFinanceAPI = loadYahooFinanceAPI();
  const api = new YahooFinanceAPI();
  assert.ok(
    Array.isArray(api.proxies),
    "Expected the instantiated YahooFinanceAPI to expose a proxies array",
  );
  for (const url of api.proxies) {
    assert.ok(
      !bannedHostRe.test(url),
      `resolved proxy list must not contain ${BANNED_PROXY_HOST} — got: ${url}`,
    );
  }
});

test("YahooFinanceAPI keeps at least one operational proxy", () => {
  const YahooFinanceAPI = loadYahooFinanceAPI();
  const api = new YahooFinanceAPI();
  assert.ok(
    Array.isArray(api.proxies) && api.proxies.length >= 1,
    "Expected the instantiated YahooFinanceAPI to resolve at least one proxy",
  );
});

test("YahooFinanceAPI never issues a request to thingproxy.freeboard.io", async () => {
  // Stub fetch to record every request URL and reject so the method fans out
  // through all configured proxies. We assert on the URLs the unit actually
  // *requests* — the observable outcome — not on how the list was built.
  const requested = [];
  const fetchStub = (url) => {
    requested.push(String(url));
    return Promise.reject(new Error("network disabled in test"));
  };
  const YahooFinanceAPI = loadYahooFinanceAPI({ fetch: fetchStub });
  const api = new YahooFinanceAPI();

  // validateFXPair() loops over the configured proxies, calling fetch() once
  // per proxy with `proxy + encodeURIComponent(yahooUrl)`.
  const result = await api.validateFXPair("AUDUSD");
  assert.equal(result, false, "all proxies rejected, so validation must fail");

  assert.ok(
    requested.length >= 1,
    "expected at least one proxy request to be issued",
  );
  for (const url of requested) {
    assert.ok(
      !bannedHostRe.test(url),
      `no request URL may target ${BANNED_PROXY_HOST} — got: ${url}`,
    );
  }
});

test("YahooFinanceAPI routes requests through every configured proxy", async () => {
  // Confirms a real configured proxy is actually exercised (not that the
  // method silently issued zero requests, which would vacuously pass above).
  const requested = [];
  const fetchStub = (url) => {
    requested.push(String(url));
    return Promise.reject(new Error("network disabled in test"));
  };
  const YahooFinanceAPI = loadYahooFinanceAPI({ fetch: fetchStub });
  const api = new YahooFinanceAPI();
  await api.validateFXPair("AUDUSD");

  for (const proxy of api.proxies) {
    assert.ok(
      requested.some((url) => url.startsWith(proxy)),
      `expected a request through configured proxy ${proxy}`,
    );
  }
});

test("CSP connect-src does not allow thingproxy.freeboard.io", () => {
  const html = readIndexHtml();
  const cspMatch = html.match(
    /<meta\s+[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/i,
  );
  assert.ok(cspMatch, "Expected a CSP meta tag in docs/index.html");
  const contentMatch = cspMatch[0].match(/\bcontent\s*=\s*"([^"]*)"/i);
  assert.ok(contentMatch, "CSP meta tag must include a content attribute");
  const content = contentMatch[1];
  assert.ok(
    !/thingproxy\.freeboard\.io/i.test(content),
    "CSP connect-src must not list thingproxy.freeboard.io (issue #24)",
  );
});
