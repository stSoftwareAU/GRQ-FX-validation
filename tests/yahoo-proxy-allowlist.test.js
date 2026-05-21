// Regression tests for the Yahoo Finance proxy allowlist (issue #24).
//
// Australian English: the dashboard fans Yahoo Finance requests out through
// a hard-coded list of third-party CORS proxies. The abandoned
// `thingproxy.freeboard.io` proxy must not appear in that list — its source
// project has been unmaintained since 2015 and a domain takeover would
// allow an attacker to inject arbitrary JSON into every dashboard visit.
//
// The CSP `connect-src` directive must also be kept in sync so the
// browser does not re-enable the dropped origin.
//
// Date: 22-May-2026

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const INDEX_JS = path.join(REPO_ROOT, "docs", "index.js");
const INDEX_HTML = path.join(REPO_ROOT, "docs", "index.html");

function readIndexJs() {
  return fs.readFileSync(INDEX_JS, "utf8");
}

function readIndexHtml() {
  return fs.readFileSync(INDEX_HTML, "utf8");
}

// Pull the `this.proxies = [ ... ]` literal out of the YahooFinanceAPI
// constructor and return it as an array of strings.
function extractProxiesArray(js) {
  const m = js.match(/this\.proxies\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return null;
  const body = m[1];
  return Array.from(body.matchAll(/["']([^"']+)["']/g)).map((x) => x[1]);
}

test("YahooFinanceAPI proxies list omits the abandoned thingproxy.freeboard.io", () => {
  const proxies = extractProxiesArray(readIndexJs());
  assert.ok(proxies, "Expected to find the YahooFinanceAPI.proxies array");
  for (const url of proxies) {
    assert.ok(
      !/thingproxy\.freeboard\.io/i.test(url),
      `proxy list must not contain thingproxy.freeboard.io — got: ${url}`,
    );
  }
});

test("YahooFinanceAPI proxies list keeps at least one operational proxy", () => {
  const proxies = extractProxiesArray(readIndexJs());
  assert.ok(proxies && proxies.length >= 1, "Expected at least one proxy URL");
  // We deliberately keep allorigins + corsproxy as the two maintained options.
  // Asserting >=1 lets a future operator collapse to a self-hosted proxy
  // without forcing this test to be rewritten in lock-step.
});

test("docs/index.js contains no surviving thingproxy.freeboard.io fetch references", () => {
  // The proxy array body must not mention thingproxy; a comment elsewhere
  // in the file documenting why it was removed is allowed (and helpful).
  const proxies = extractProxiesArray(readIndexJs());
  assert.ok(proxies, "Expected to find the YahooFinanceAPI.proxies array");
  const joined = proxies.join("\n");
  assert.ok(
    !/thingproxy\.freeboard\.io/i.test(joined),
    `proxy URLs must not reference thingproxy.freeboard.io — got: ${joined}`,
  );
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
