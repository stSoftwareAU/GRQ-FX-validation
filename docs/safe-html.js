// Shared HTML-escaping helper for the GRQ FX Validation Dashboard.
//
// Australian English: this helper provides contextual output encoding for
// the few values that must be interpolated into an HTML *string* before it
// is assigned to `innerHTML` (e.g. an error message that embeds an untrusted
// FX pair name sourced from `predictions.json`). Encoding the five HTML
// metacharacters neutralises DOM HTML-injection on those routes — see issue
// #86. Where a value can be rendered as a DOM node instead, prefer the
// `textContent` builders in `safe-card.js` / `safe-error-banner.js`.
//
// Exposed as `globalThis.escapeHtml` so the dashboard (loaded as a classic
// script in `docs/index.html`) and the Deno test harness share one
// implementation.

(function attachEscapeHtml(global) {
  "use strict";

  const REPLACEMENTS = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  // Coerce to string, then replace each HTML metacharacter with its entity so
  // the result is safe to interpolate into HTML text or a double/single-quoted
  // attribute value.
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => REPLACEMENTS[ch]);
  }

  global.escapeHtml = escapeHtml;
})(typeof globalThis !== "undefined" ? globalThis : this);
