// Service worker pathname guards for GRQ FX Validation Dashboard
// Australian English: these tests prevent regressions where predictions.json or
// CSV data becomes stale due to incorrect URL.pathname matching.
//
// Date: 5-Jan-2026

const sw = await Deno.readTextFile(new URL("../docs/sw.js", import.meta.url));

Deno.test("sw.js matches CSV and dated predictions.json using pathname-based regexes", () => {
  if (!sw.includes("/\\/data\\/.*\\.csv$/")) {
    throw new Error(
      "Expected sw.js to include pathname regex /\\/data\\/.*\\.csv$/",
    );
  }
  if (!sw.includes("/\\/\\d{4}-\\d{2}-\\d{2}\\/predictions\\.json$/")) {
    throw new Error(
      "Expected sw.js to include pathname regex for dated predictions.json files",
    );
  }

  if (sw.includes("\\.\\/data\\/")) {
    throw new Error(
      "sw.js still appears to contain './data/' which does not match URL.pathname",
    );
  }
});

Deno.test("sw.js does not treat predictions.json as a cache-first static JSON asset", () => {
  // sw.js writes the guard with double-quoted ".json" — match that.
  // Issue #30: the original single-quoted check never matched the source.
  if (!sw.includes('endsWith(".json") && !isNetworkFirst && !isDataFile')) {
    throw new Error(
      "Expected sw.js to exclude data JSON from the static asset .json matcher",
    );
  }
});
