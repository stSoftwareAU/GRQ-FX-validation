// Safe DOM builder for the Yahoo Finance error banner.
//
// Australian English: this helper renders the Yahoo Finance error banner
// using `document.createElement` and `textContent` so that messages
// originating from `predictions.json` (e.g. `pair.pair`) or from network
// error messages (which embed request URLs derived from `pair.pair`) are
// treated as text rather than HTML. This protects the dashboard from
// DOM-based XSS — see issue #21.
//
// Exposed as `globalThis.renderYahooFinanceErrorBanner` so the dashboard
// (loaded as a classic script in `docs/index.html`) and the Deno test
// harness can share the same implementation.

(function attachSafeErrorBanner(global) {
  "use strict";

  function renderYahooFinanceErrorBanner(container, message, doc) {
    if (!container) return;
    const document_ = doc || global.document;

    // Clear any prior children — prevents accumulation across calls and
    // avoids relying on innerHTML assignment, which would parse HTML.
    if (typeof container.replaceChildren === "function") {
      container.replaceChildren();
    } else {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    }

    const small = document_.createElement("small");

    const icon = document_.createElement("i");
    icon.className = "fas fa-exclamation-triangle me-1";
    small.appendChild(icon);

    // textContent treats the message as plain text — any HTML markup in the
    // value is rendered as characters, never as DOM nodes.
    small.appendChild(document_.createTextNode(" " + String(message)));

    container.appendChild(small);
  }

  global.renderYahooFinanceErrorBanner = renderYahooFinanceErrorBanner;
})(typeof globalThis !== "undefined" ? globalThis : this);
