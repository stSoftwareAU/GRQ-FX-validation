// Regression tests for CDN Subresource Integrity (SRI) pinning (issue #13).
// Australian English: these tests verify every jsdelivr.net asset loaded
// from docs/index.html and listed in docs/sw.js's STATIC_ASSETS is
// pinned to a specific version (`@x.y.z`) and carries both an
// `integrity="sha384-…"` attribute and `crossorigin="anonymous"`.
//
// Without these guards a malicious release of `chart.js` (or a
// CDN/edge compromise) would be served and trusted automatically by
// every visitor, then locked into the service worker cache offline.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd());
const INDEX_HTML = path.join(REPO_ROOT, "docs", "index.html");
const SW_JS = path.join(REPO_ROOT, "docs", "sw.js");

function readIndex() {
  return fs.readFileSync(INDEX_HTML, "utf8");
}

function readSw() {
  return fs.readFileSync(SW_JS, "utf8");
}

// Match every <script src="https://cdn.jsdelivr.net/..."> and
// <link ... href="https://cdn.jsdelivr.net/...">. Captures the whole
// tag text so we can inspect its attributes.
const TAG_RE =
  /<(?:script|link)\b[^>]*?(?:src|href)\s*=\s*["']https:\/\/cdn\.jsdelivr\.net\/[^"']+["'][^>]*>/gi;

function extractCdnTags(html) {
  const tags = [];
  let m;
  while ((m = TAG_RE.exec(html)) !== null) {
    tags.push(m[0]);
  }
  return tags;
}

function getAttr(tag, attr) {
  const re = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']*)["']`, "i");
  const m = tag.match(re);
  return m ? m[1] : null;
}

function getCdnUrl(tag) {
  return getAttr(tag, "src") || getAttr(tag, "href");
}

test("docs/index.html loads at least four assets from jsdelivr", () => {
  const tags = extractCdnTags(readIndex());
  assert.ok(
    tags.length >= 4,
    `Expected at least 4 jsdelivr-hosted assets in index.html, found ${tags.length}`,
  );
});

test("every jsdelivr asset in index.html pins a specific @version", () => {
  const tags = extractCdnTags(readIndex());
  for (const tag of tags) {
    const url = getCdnUrl(tag);
    assert.match(
      url,
      /\/npm\/[^/]+@\d+\.\d+\.\d+(?:[\w.-]*)?(?:\/|$)/,
      `CDN URL must pin a specific @x.y.z version: ${url}`,
    );
  }
});

test("every jsdelivr asset in index.html has integrity=sha384-... and crossorigin=anonymous", () => {
  const tags = extractCdnTags(readIndex());
  for (const tag of tags) {
    const integrity = getAttr(tag, "integrity");
    const crossorigin = getAttr(tag, "crossorigin");
    assert.ok(
      integrity && /^sha384-[A-Za-z0-9+/=]+$/.test(integrity),
      `Tag is missing or has malformed sha384 integrity: ${tag}`,
    );
    assert.equal(
      crossorigin,
      "anonymous",
      `Tag must declare crossorigin="anonymous": ${tag}`,
    );
  }
});

test("Bootstrap CSS and Bootstrap JS use the same major.minor.patch version", () => {
  const tags = extractCdnTags(readIndex());
  const versions = new Set();
  for (const tag of tags) {
    const url = getCdnUrl(tag);
    const m = url.match(/\/npm\/bootstrap@([\d.]+)\//);
    if (m) versions.add(m[1]);
  }
  assert.equal(
    versions.size,
    1,
    `Bootstrap CSS and JS must be pinned to the same version (found ${
      [...versions].join(", ")
    })`,
  );
});

test("chart.js URL in index.html is pinned to a specific version", () => {
  const tags = extractCdnTags(readIndex());
  const chartTag = tags.find((t) => /\/chart\.js@/.test(t));
  assert.ok(chartTag, "Expected a pinned chart.js@x.y.z tag in index.html");
  // The bare `cdn.jsdelivr.net/npm/chart.js` (no @version) is rejected
  // by the `every jsdelivr asset pins @version` test above; this guards
  // the named package specifically.
  assert.doesNotMatch(
    readIndex(),
    /https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js(?!@)/,
    "Bare chart.js (without @version) is still present in index.html",
  );
});

test("chartjs-adapter-date-fns URL in index.html is pinned to a specific version", () => {
  const html = readIndex();
  assert.match(
    html,
    /https:\/\/cdn\.jsdelivr\.net\/npm\/chartjs-adapter-date-fns@\d+\.\d+\.\d+/,
    "Expected a pinned chartjs-adapter-date-fns@x.y.z URL in index.html",
  );
  assert.doesNotMatch(
    html,
    /https:\/\/cdn\.jsdelivr\.net\/npm\/chartjs-adapter-date-fns(?!@)/,
    "Bare chartjs-adapter-date-fns (without @version) is still present in index.html",
  );
});

test("docs/sw.js STATIC_ASSETS CDN URLs match the pinned URLs in index.html", () => {
  const html = readIndex();
  const sw = readSw();

  const tags = extractCdnTags(html);
  const indexUrls = tags.map(getCdnUrl).sort();

  // Pull every absolute cdn.jsdelivr URL out of sw.js (any context).
  const swUrls = [
    ...sw.matchAll(/https:\/\/cdn\.jsdelivr\.net\/[^"'\s]+/g),
  ].map((m) => m[0]).sort();

  for (const url of indexUrls) {
    assert.ok(
      swUrls.includes(url),
      `sw.js STATIC_ASSETS is missing the pinned URL ${url} (or it does not match the one referenced from index.html)`,
    );
  }
  for (const url of swUrls) {
    assert.doesNotMatch(
      url,
      /\/npm\/[^@]+\/(?!.*@\d)/,
      `sw.js still references an unpinned jsdelivr URL: ${url}`,
    );
    assert.match(
      url,
      /\/npm\/[^/]+@\d+\.\d+\.\d+/,
      `sw.js must reference only pinned jsdelivr URLs: ${url}`,
    );
  }
});
