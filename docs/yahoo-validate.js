// Schema validator for Yahoo Finance proxy responses.
//
// Australian English: every Yahoo Finance call in `docs/index.js` is routed
// through a third-party CORS proxy. The proxy operator can substitute the
// response body at will, so the parsed JSON cannot be trusted. This helper
// performs a small, strict schema check before any field reaches a DOM
// sink — see issue #24.
//
// The validator returns `{ ok: true }` for well-formed payloads and
// `{ ok: false, reason }` otherwise. Call sites bail out on `ok === false`
// and treat the response as if the proxy had failed.
//
// Exposed as `globalThis.validateYahooFinanceResponse` so the dashboard
// (loaded as a classic script) and the Deno test harness share a single
// implementation.

(function attachYahooValidator(global) {
  "use strict";

  // Yahoo Finance FX symbols are upper-case letters followed by "=X"
  // (e.g. AUDUSD=X, JPY=X). The strict regex blocks markup characters,
  // whitespace, and any other smuggled payload from reaching DOM sinks.
  var SYMBOL_RE = /^[A-Z]+=X$/;

  // Reject anything that looks like HTML markup or a known XSS prefix.
  // We intentionally err on the side of strictness — Yahoo's legitimate
  // shortName / longName values are plain ASCII text with punctuation.
  var MARKUP_RE = /[<>]|javascript:|data:|on[a-z]+\s*=/i;

  function isPlainObject(value) {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    );
  }

  function isOptionalSafeString(value) {
    if (value === undefined || value === null) return true;
    if (typeof value !== "string") return false;
    if (value.length > 256) return false;
    if (MARKUP_RE.test(value)) return false;
    return true;
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function isFiniteNumberArray(value) {
    if (!Array.isArray(value)) return false;
    for (var i = 0; i < value.length; i++) {
      if (!isFiniteNumber(value[i])) return false;
    }
    return true;
  }

  // Price arrays from Yahoo may include `null` for missing samples; the
  // dashboard filters those before plotting. Any non-null value must be
  // a finite number.
  function isPriceArray(value) {
    if (!Array.isArray(value)) return false;
    for (var i = 0; i < value.length; i++) {
      var v = value[i];
      if (v === null) continue;
      if (!isFiniteNumber(v)) return false;
    }
    return true;
  }

  function fail(reason) {
    return { ok: false, reason: reason };
  }

  function validateYahooFinanceResponse(data) {
    if (!isPlainObject(data)) return fail("response is not an object");

    var chart = data.chart;
    if (!isPlainObject(chart)) return fail("chart is missing");

    var result = chart.result;
    if (!Array.isArray(result) || result.length === 0) {
      return fail("chart.result is missing or empty");
    }

    var first = result[0];
    if (!isPlainObject(first)) return fail("chart.result[0] is not an object");

    var meta = first.meta;
    if (!isPlainObject(meta)) return fail("meta is missing");

    if (typeof meta.symbol !== "string" || !SYMBOL_RE.test(meta.symbol)) {
      return fail("meta.symbol does not match the FX symbol pattern");
    }

    if (!isOptionalSafeString(meta.shortName)) {
      return fail("meta.shortName contains unsafe characters");
    }
    if (!isOptionalSafeString(meta.longName)) {
      return fail("meta.longName contains unsafe characters");
    }

    // Yahoo Finance returns metadata-only responses (no timestamp /
    // indicators) when called with `range=1d` and the market has not yet
    // opened. validateFXPair and getFXPairDescription rely on that shape,
    // so the validator only checks timestamp / indicators when present.
    if (first.timestamp !== undefined) {
      if (!isFiniteNumberArray(first.timestamp)) {
        return fail("timestamp must be an array of finite numbers");
      }
    }

    if (first.indicators !== undefined) {
      if (!isPlainObject(first.indicators)) {
        return fail("indicators is not an object");
      }
      var quote = first.indicators.quote;
      if (quote !== undefined) {
        if (!Array.isArray(quote) || !isPlainObject(quote[0])) {
          return fail("indicators.quote must be a non-empty array");
        }
        var fields = ["open", "high", "low", "close"];
        for (var i = 0; i < fields.length; i++) {
          var f = fields[i];
          var arr = quote[0][f];
          if (arr === undefined) continue;
          if (!isPriceArray(arr)) {
            return fail("indicators.quote[0]." + f + " is not numeric");
          }
        }
      }
    }

    return { ok: true };
  }

  global.validateYahooFinanceResponse = validateYahooFinanceResponse;
})(typeof globalThis !== "undefined" ? globalThis : this);
