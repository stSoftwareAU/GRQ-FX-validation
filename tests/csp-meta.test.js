// Content-Security-Policy regression tests for docs/index.html (issue #23).
// Australian English: these tests guarantee that the dashboard ships a
// restrictive CSP meta tag and that the surrounding HTML/JS do not rely
// on directives the CSP forbids. Without these guards a DOM-XSS sink
// (such as the one in issue #21) would execute with full origin
// authority — the CSP is our defence-in-depth.
//
// Date: 22-May-2026

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const INDEX_HTML = path.join(REPO_ROOT, "docs", "index.html");
const SW_JS = path.join(REPO_ROOT, "docs", "sw.js");
const INDEX_JS = path.join(REPO_ROOT, "docs", "index.js");
const SW_REGISTER_JS = path.join(REPO_ROOT, "docs", "sw-register.js");

function readIndex() {
  return fs.readFileSync(INDEX_HTML, "utf8");
}

// Extract the CSP meta tag from the head of docs/index.html.
function extractCspMeta(html) {
  const re =
    /<meta\s+[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/i;
  const m = html.match(re);
  return m ? m[0] : null;
}

function getContent(metaTag) {
  const m = metaTag.match(/\bcontent\s*=\s*"([^"]*)"/i);
  return m ? m[1] : null;
}

// Parse a CSP `content` string into a directive map.
// Returns { directive: [source, source, ...] }.
function parseCsp(content) {
  const directives = {};
  const cleaned = content.replace(/\s+/g, " ").trim();
  for (const part of cleaned.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const name = tokens[0].toLowerCase();
    directives[name] = tokens.slice(1);
  }
  return directives;
}

test("docs/index.html declares a Content-Security-Policy meta tag", () => {
  const html = readIndex();
  const meta = extractCspMeta(html);
  assert.ok(
    meta,
    "Expected a <meta http-equiv=\"Content-Security-Policy\"> element in docs/index.html",
  );
  const content = getContent(meta);
  assert.ok(
    content && content.length > 0,
    "CSP meta tag must include a non-empty content attribute",
  );
});

test("CSP defines all required hardening directives", () => {
  const meta = extractCspMeta(readIndex());
  const csp = parseCsp(getContent(meta));

  const required = [
    "default-src",
    "script-src",
    "style-src",
    "img-src",
    "font-src",
    "connect-src",
    "object-src",
    "base-uri",
    "frame-ancestors",
  ];
  for (const directive of required) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(csp, directive),
      `CSP must define directive: ${directive}`,
    );
  }
});

test("CSP locks down dangerous defaults", () => {
  const meta = extractCspMeta(readIndex());
  const csp = parseCsp(getContent(meta));

  assert.deepEqual(
    csp["default-src"],
    ["'self'"],
    "default-src must be 'self' only",
  );
  assert.deepEqual(
    csp["object-src"],
    ["'none'"],
    "object-src must be 'none' to block <object>/<embed> XSS gadgets",
  );
  assert.deepEqual(
    csp["base-uri"],
    ["'self'"],
    "base-uri must be 'self' to prevent <base href> hijack",
  );
  assert.deepEqual(
    csp["frame-ancestors"],
    ["'none'"],
    "frame-ancestors must be 'none' to block clickjacking",
  );
});

test("script-src forbids 'unsafe-inline' and 'unsafe-eval'", () => {
  const meta = extractCspMeta(readIndex());
  const csp = parseCsp(getContent(meta));
  const sources = csp["script-src"] || [];

  assert.ok(
    !sources.includes("'unsafe-inline'"),
    "script-src must not allow 'unsafe-inline' — inline <script> blocks defeat XSS protection",
  );
  assert.ok(
    !sources.includes("'unsafe-eval'"),
    "script-src must not allow 'unsafe-eval' — would re-enable eval()/new Function()",
  );
  assert.ok(
    sources.includes("'self'"),
    "script-src must allow 'self' so local scripts continue to load",
  );
  assert.ok(
    sources.includes("https://cdn.jsdelivr.net"),
    "script-src must allow https://cdn.jsdelivr.net for Bootstrap and Chart.js",
  );
});

test("connect-src allows every fetch origin used by docs/index.js", () => {
  const meta = extractCspMeta(readIndex());
  const csp = parseCsp(getContent(meta));
  const sources = csp["connect-src"] || [];

  // These are the proxy/data origins referenced from docs/index.js.
  // `thingproxy.freeboard.io` was dropped in issue #24 — the abandoned
  // proxy must NOT appear in this list, see the dedicated regression
  // test in tests/yahoo-proxy-allowlist.test.js.
  const required = [
    "'self'",
    "https://query1.finance.yahoo.com",
    "https://api.allorigins.win",
    "https://corsproxy.io",
  ];
  for (const src of required) {
    assert.ok(
      sources.includes(src),
      `connect-src must include ${src} so the Yahoo Finance proxies still work`,
    );
  }
});

test("docs/index.html has no inline <script> blocks", () => {
  // Inline script blocks are blocked by `script-src 'self'` unless a
  // nonce or hash is added. Keeping them out makes the CSP simple and
  // robust against regression (we cannot regenerate nonces from a
  // static GitHub Pages deploy).
  const html = readIndex();
  // Match <script ...>...</script> where the open tag has no src attribute.
  const re = /<script\b((?:(?!\bsrc\s*=)[^>])*)>([\s\S]*?)<\/script>/gi;
  let m;
  const offenders = [];
  while ((m = re.exec(html)) !== null) {
    const body = m[2].trim();
    if (body.length > 0) {
      offenders.push(body.slice(0, 80));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `docs/index.html must not contain inline <script> bodies; found: ${
      JSON.stringify(offenders)
    }`,
  );
});

test("docs/index.html has no inline event-handler attributes", () => {
  // Inline event handlers (onclick=, onload=, onerror=, …) are blocked
  // by CSP. Make sure none survive in the static HTML.
  const html = readIndex();
  const re = /<[^>]*\bon[a-z]+\s*=/i;
  assert.ok(
    !re.test(html),
    "docs/index.html must not contain inline on*= event handlers",
  );
});

// Issue #43: the previous "docs/index.js has no inline event-handler
// attributes in template literals" test was a source-grep HOW-test. It
// passed whenever the substring `onclick=` happened to appear (or not)
// anywhere in the file — including in unrelated comments — and gave
// false confidence about runtime XSS protection.
//
// The runtime defences that actually matter are now exercised
// behaviourally elsewhere in this file and the wider suite:
//   • The CSP meta tag forbids `unsafe-inline` on script-src (asserted
//     above by "script-src forbids 'unsafe-inline' and 'unsafe-eval'"),
//     so any inline event handler in the static HTML or injected via
//     innerHTML is refused execution by the browser at runtime.
//   • `tests/fx-card-xss.test.ts::buildFXPairCard does not emit an
//     inline onclick attribute` exercises the card-render path with a
//     hostile pair name and inspects the rendered DOM.
//   • `tests/yahoo-error-banner-xss.test.ts::showYahooFinanceError
//     renders attacker-controlled messages as encoded text (DOM-level)`
//     exercises the error-banner path and scans tag headers for any
//     `on*=` attribute on the rendered DOM.
//
// Read the verifier that asserts on the rendered DOM (the WHAT) rather
// than reading the source for substrings (the HOW).

test("docs/sw-register.js exists and is referenced from index.html", () => {
  assert.ok(
    fs.existsSync(SW_REGISTER_JS),
    "Expected docs/sw-register.js — the inline service worker registration must be extracted",
  );
  const html = readIndex();
  assert.ok(
    /<script[^>]*\bsrc\s*=\s*["']sw-register\.js[^"']*["']/i.test(html),
    "docs/index.html must reference sw-register.js via <script src=...>",
  );
});

test("docs/sw.js caches sw-register.js and safe-error-banner.js", () => {
  const sw = fs.readFileSync(SW_JS, "utf8");
  assert.ok(
    /["']\.\/sw-register\.js["']/.test(sw),
    "sw.js STATIC_ASSETS must include './sw-register.js' so the registrar is available offline",
  );
  assert.ok(
    /["']\.\/safe-error-banner\.js["']/.test(sw),
    "sw.js STATIC_ASSETS must include './safe-error-banner.js' (defence-in-depth helper from issue #21)",
  );
  assert.ok(
    /["']\.\/yahoo-validate\.js["']/.test(sw),
    "sw.js STATIC_ASSETS must include './yahoo-validate.js' (Yahoo Finance response validator from issue #24)",
  );
});
