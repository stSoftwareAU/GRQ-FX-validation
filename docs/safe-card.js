// Safe DOM builder for FX-pair cards.
//
// Australian English: this helper builds the `fx-pair-card` DOM tree using
// `document.createElement` and `textContent` so that values originating from
// `predictions.json` (a static file controlled by PR contributors) are
// treated as text rather than HTML or JavaScript source. This protects the
// dashboard from DOM-based XSS — see issue #12.
//
// Exposed as `globalThis.buildFXPairCard` so the dashboard (loaded as a
// classic script in `docs/index.html`) and the Deno test harness can share
// the same implementation.

(function attachSafeCardBuilder(global) {
  "use strict";

  function makeCell(doc, label, change, formatPercentage) {
    const col6 = doc.createElement("div");
    col6.className = "col-6";

    const small = doc.createElement("small");
    small.textContent = label;
    col6.appendChild(small);

    col6.appendChild(doc.createElement("br"));

    const span = doc.createElement("span");
    span.className = "prediction-change " +
      (change !== null && change >= 0 ? "positive" : "negative");
    span.textContent = formatPercentage(change);
    col6.appendChild(span);

    return col6;
  }

  function makeSlopeCell(doc, label, slope) {
    const col6 = doc.createElement("div");
    col6.className = "col-6";

    const small = doc.createElement("small");
    small.textContent = label;
    col6.appendChild(small);

    col6.appendChild(doc.createElement("br"));

    const span = doc.createElement("span");
    span.className = "prediction-change " +
      (slope !== null && slope >= 0 ? "positive" : "negative");
    span.textContent = slope !== null
      ? (slope >= 0 ? "+" : "") + slope.toFixed(2) + "%"
      : "N/A";
    col6.appendChild(span);

    return col6;
  }

  function makeRow(doc, left, right, extraClass) {
    const row = doc.createElement("div");
    row.className = "row";
    if (extraClass) row.classList.add(extraClass);
    if (left) row.appendChild(left);
    if (right) row.appendChild(right);
    return row;
  }

  function buildFXPairCard(pair, doc, formatters, onSelect) {
    const {
      formatCurrency,
      formatPercentage,
      calculateBestFitSlope,
    } = formatters;

    const col = doc.createElement("div");
    col.className = "col-md-6 col-lg-4 mb-3";

    const card = doc.createElement("div");
    card.className = "fx-pair-card";
    // Use a bound event listener so the pair name never enters HTML or
    // JS-string parsing — the literal value is captured in closure.
    card.addEventListener("click", function () {
      onSelect(pair.pair);
    });

    // Header row: pair name and current rate badge.
    const header = doc.createElement("div");
    header.className = "d-flex justify-content-between align-items-start mb-2";

    const heading = doc.createElement("h5");
    heading.className = "mb-0";
    heading.textContent = pair.pair;
    header.appendChild(heading);

    const badge = doc.createElement("span");
    badge.className = "badge bg-primary";
    badge.textContent = formatCurrency(pair.currentRate);
    header.appendChild(badge);

    card.appendChild(header);

    // Prediction summary grid.
    const summary = doc.createElement("div");
    summary.className = "prediction-summary";

    const monthlyChange = pair.predictions[0] &&
        pair.predictions[0].predictedChangePercent !== undefined
      ? pair.predictions[0].predictedChangePercent
      : null;
    const quarterlyChange = pair.predictions[1] &&
        pair.predictions[1].predictedChangePercent !== undefined
      ? pair.predictions[1].predictedChangePercent
      : null;
    const halfYearChange = pair.predictions[2] &&
        pair.predictions[2].predictedChangePercent !== undefined
      ? pair.predictions[2].predictedChangePercent
      : null;
    const threeQuarterChange = pair.predictions[3] &&
        pair.predictions[3].predictedChangePercent !== undefined
      ? pair.predictions[3].predictedChangePercent
      : null;
    const yearlyChange = pair.predictions[4] &&
        pair.predictions[4].predictedChangePercent !== undefined
      ? pair.predictions[4].predictedChangePercent
      : null;
    const slope = calculateBestFitSlope(pair.predictions);

    summary.appendChild(
      makeRow(
        doc,
        makeCell(doc, "Month (30d):", monthlyChange, formatPercentage),
        makeCell(doc, "Quarter (90d):", quarterlyChange, formatPercentage),
      ),
    );
    summary.appendChild(
      makeRow(
        doc,
        makeCell(doc, "Half Year (180d):", halfYearChange, formatPercentage),
        makeCell(
          doc,
          "3/4 Year (270d):",
          threeQuarterChange,
          formatPercentage,
        ),
        "mt-1",
      ),
    );
    summary.appendChild(
      makeRow(
        doc,
        makeCell(doc, "Year (365d):", yearlyChange, formatPercentage),
        makeSlopeCell(doc, "Slope (per month):", slope),
        "mt-1",
      ),
    );

    card.appendChild(summary);
    col.appendChild(card);
    return col;
  }

  global.buildFXPairCard = buildFXPairCard;
})(typeof globalThis !== "undefined" ? globalThis : this);
