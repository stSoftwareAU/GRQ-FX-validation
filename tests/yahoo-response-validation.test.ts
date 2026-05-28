// Schema-validation regression tests for Yahoo Finance proxy responses
// (issue #24).
//
// Australian English: every Yahoo Finance call in `docs/index.js` flows
// through a third-party CORS proxy. Even with the abandoned thingproxy
// dropped, the remaining proxies are still untrusted intermediaries. The
// dashboard MUST validate the shape of every parsed response before
// letting any field reach a DOM sink — otherwise a malicious or
// compromised proxy can shape responses that, for example, embed
// HTML markup in `meta.shortName` or non-numeric values in price arrays
// that later flow into chart rendering.
//
// This file exercises `validateYahooFinanceResponse(data)` — exposed by
// `docs/yahoo-validate.js` on `globalThis` — and verifies the helper
// rejects every malformed shape we know an attacker could craft.
//
// Date: 22-May-2026

async function loadValidator(): Promise<
  (
    data: unknown,
  ) => { ok: boolean; reason?: string }
> {
  const src = await Deno.readTextFile(
    new URL("../docs/yahoo-validate.js", import.meta.url),
  );
  // deno-lint-ignore no-explicit-any
  const scope: any = {};
  const factory = new Function(
    "globalThis",
    "window",
    src + "\nreturn globalThis.validateYahooFinanceResponse;",
  );
  return factory(scope, scope);
}

function goodResponse() {
  return {
    chart: {
      result: [
        {
          meta: {
            symbol: "AUDUSD=X",
            shortName: "AUD/USD",
            longName: "Australian Dollar / US Dollar",
          },
          timestamp: [1716336000, 1716422400],
          indicators: {
            quote: [
              {
                open: [0.661, 0.662],
                high: [0.665, 0.666],
                low: [0.659, 0.660],
                close: [0.663, 0.664],
              },
            ],
          },
        },
      ],
    },
  };
}

Deno.test("validateYahooFinanceResponse accepts a well-formed Yahoo Finance payload", async () => {
  const validate = await loadValidator();
  const res = validate(goodResponse());
  if (!res.ok) {
    throw new Error(`Expected good payload to validate, got: ${res.reason}`);
  }
});

Deno.test("validateYahooFinanceResponse rejects non-object / null payloads", async () => {
  const validate = await loadValidator();
  for (const bad of [null, undefined, "", 0, false, [], "string"]) {
    const res = validate(bad);
    if (res.ok) {
      throw new Error(
        `Expected non-object payload (${JSON.stringify(bad)}) to be rejected`,
      );
    }
  }
});

Deno.test("validateYahooFinanceResponse rejects missing chart.result", async () => {
  const validate = await loadValidator();
  const cases: Array<unknown> = [
    {},
    { chart: null },
    { chart: {} },
    { chart: { result: null } },
    { chart: { result: [] } },
    { chart: { result: "not-an-array" } },
  ];
  for (const c of cases) {
    const res = validate(c);
    if (res.ok) {
      throw new Error(
        `Expected missing chart.result (${JSON.stringify(c)}) to be rejected`,
      );
    }
  }
});

Deno.test("validateYahooFinanceResponse rejects responses whose meta.symbol is not a valid FX symbol", async () => {
  const validate = await loadValidator();
  const cases = [
    "<img src=x onerror=alert(1)>=X", // XSS payload smuggled as symbol
    "audusd=x", // lowercase rejected
    "AUDUSD", // no =X suffix rejected
    "AUD/USD=X", // slash forbidden — Yahoo format omits it
    "AUD USD=X", // space forbidden
    "", // empty rejected
  ];
  for (const symbol of cases) {
    const data = goodResponse();
    data.chart.result[0].meta.symbol = symbol;
    const res = validate(data);
    if (res.ok) {
      throw new Error(
        `Expected symbol '${symbol}' to be rejected by the validator`,
      );
    }
  }
});

Deno.test("validateYahooFinanceResponse rejects HTML markup in meta.shortName / meta.longName", async () => {
  const validate = await loadValidator();
  for (const field of ["shortName", "longName"]) {
    const data = goodResponse();
    // deno-lint-ignore no-explicit-any
    (data.chart.result[0].meta as any)[field] = "<script>alert(1)</script>EVIL";
    const res = validate(data);
    if (res.ok) {
      throw new Error(
        `Expected HTML in meta.${field} to be rejected by the validator`,
      );
    }
  }
});

Deno.test("validateYahooFinanceResponse accepts a response with no shortName/longName (Yahoo may omit them)", async () => {
  const validate = await loadValidator();
  const data = goodResponse();
  // deno-lint-ignore no-explicit-any
  delete (data.chart.result[0].meta as any).shortName;
  // deno-lint-ignore no-explicit-any
  delete (data.chart.result[0].meta as any).longName;
  const res = validate(data);
  if (!res.ok) {
    throw new Error(
      `Expected response without optional meta fields to validate, got: ${res.reason}`,
    );
  }
});

Deno.test("validateYahooFinanceResponse rejects timestamp arrays that are not all finite numbers", async () => {
  const validate = await loadValidator();
  const cases: Array<unknown> = [
    "not-an-array",
    [1, "two", 3],
    [1, NaN, 3],
    [1, Infinity, 3],
    [1, null, 3],
  ];
  for (const ts of cases) {
    const data = goodResponse();
    // deno-lint-ignore no-explicit-any
    (data.chart.result[0] as any).timestamp = ts;
    const res = validate(data);
    if (res.ok) {
      throw new Error(
        `Expected non-numeric timestamp (${JSON.stringify(ts)}) to be rejected`,
      );
    }
  }
});

Deno.test("validateYahooFinanceResponse tolerates missing timestamp (metadata-only responses)", async () => {
  // Yahoo Finance returns metadata-only responses (no timestamp/indicators)
  // when called with `range=1d` and the market has not yet opened. The
  // FX-pair description / validateFXPair code paths intentionally hit that
  // shape, so the validator must let it through.
  const validate = await loadValidator();
  const data = goodResponse();
  // deno-lint-ignore no-explicit-any
  delete (data.chart.result[0] as any).timestamp;
  // deno-lint-ignore no-explicit-any
  delete (data.chart.result[0] as any).indicators;
  const res = validate(data);
  if (!res.ok) {
    throw new Error(
      `Expected metadata-only response to validate, got: ${res.reason}`,
    );
  }
});

Deno.test("validateYahooFinanceResponse rejects price arrays that contain non-finite values", async () => {
  const validate = await loadValidator();
  const fields = ["open", "high", "low", "close"] as const;
  for (const field of fields) {
    const data = goodResponse();
    // null is permitted by Yahoo for missing samples — we only reject non-null
    // values that fail Number.isFinite (e.g. NaN, Infinity, strings).
    // deno-lint-ignore no-explicit-any
    (data.chart.result[0].indicators.quote[0] as any)[field] = [
      0.5,
      "evil-string",
    ];
    const res = validate(data);
    if (res.ok) {
      throw new Error(
        `Expected non-numeric value in quote.${field} to be rejected`,
      );
    }
  }
});

Deno.test("validateYahooFinanceResponse allows null entries in price arrays (Yahoo uses null for gaps)", async () => {
  const validate = await loadValidator();
  const data = goodResponse();
  // Yahoo Finance emits null for missing samples; the dashboard already
  // filters these out before plotting, so they must be allowed through.
  data.chart.result[0].indicators.quote[0].open = [
    0.5,
    null,
  ] as unknown as number[];
  data.chart.result[0].indicators.quote[0].high = [
    0.6,
    null,
  ] as unknown as number[];
  data.chart.result[0].indicators.quote[0].low = [
    0.4,
    null,
  ] as unknown as number[];
  data.chart.result[0].indicators.quote[0].close = [
    0.55,
    null,
  ] as unknown as number[];
  const res = validate(data);
  if (!res.ok) {
    throw new Error(
      `Expected null-padded price arrays to validate, got: ${res.reason}`,
    );
  }
});

// Issue #43: the previous "count occurrences >= 4" test was a brittle
// HOW-test — combining the four fetch paths into a single helper would
// have failed the test while *improving* the code, and adding an
// unrelated comment containing `validateYahooFinanceResponse(` could
// pad the count. Rewritten as a WHAT-test: load the YahooFinanceAPI
// class with `fetch` stubbed to return a hostile payload that the
// validator would reject, exercise each of the four Yahoo fetch
// methods, and assert that none of them leak the hostile content into
// their return values.
Deno.test("Every YahooFinanceAPI fetch path rejects payloads the validator marks invalid", async () => {
  const src = await Deno.readTextFile(
    new URL("../docs/index.js", import.meta.url),
  );
  const classStart = src.indexOf("class YahooFinanceAPI {");
  if (classStart === -1) {
    throw new Error("Could not locate class YahooFinanceAPI in docs/index.js");
  }
  // Walk balanced braces from the class open brace to its matching close.
  const bodyStart = src.indexOf("{", classStart);
  let depth = 0;
  let classEnd = -1;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        classEnd = i;
        break;
      }
    }
  }
  if (classEnd === -1) {
    throw new Error("Could not locate the closing brace of YahooFinanceAPI");
  }
  const classSrc = src.slice(classStart, classEnd + 1);

  // Load the real validator so the methods' guards see authentic
  // accept/reject decisions.
  const validatorSrc = await Deno.readTextFile(
    new URL("../docs/yahoo-validate.js", import.meta.url),
  );
  // deno-lint-ignore no-explicit-any
  const scope: any = {};
  const loadValidator = new Function(
    "globalThis",
    "window",
    validatorSrc + "\nreturn globalThis.validateYahooFinanceResponse;",
  );
  const validateYahooFinanceResponse = loadValidator(scope, scope);

  // Hostile response with a clearly-identifiable sentinel. Symbols
  // containing HTML markup are rejected by the validator (see the
  // "rejects responses whose meta.symbol is not a valid FX symbol"
  // tests above), so this payload will be marked invalid and must not
  // surface in any return value.
  const SENTINEL = "POWNED-XSS-MARKER-2026";
  const hostileResponse = {
    chart: {
      result: [
        {
          meta: {
            // Invalid symbol — validator rejects.
            symbol: `<img src=x onerror=alert(${SENTINEL})>=X`,
            shortName: SENTINEL,
            longName: SENTINEL,
          },
          timestamp: [1716336000],
          indicators: {
            quote: [{
              open: [0.5],
              high: [0.6],
              low: [0.4],
              close: [0.55],
            }],
          },
        },
      ],
    },
  };

  // Sanity check: the validator does reject this shape.
  const verdict = validateYahooFinanceResponse(hostileResponse);
  if (verdict.ok) {
    throw new Error(
      "Test setup error: hostile response was unexpectedly accepted by the validator",
    );
  }

  // Stub `fetch` to return the hostile payload for every call. Each
  // proxy attempt receives the same data; the methods must each refuse
  // to extract from it.
  const stubFetch = (_url: string, _init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify(hostileResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

  // Evaluate the class inside a fresh scope where the only fetch is
  // ours and the validator is the real one.
  const factory = new Function(
    "fetch",
    "validateYahooFinanceResponse",
    "console",
    classSrc + "\nreturn YahooFinanceAPI;",
  );
  const YahooFinanceAPI = factory(
    stubFetch,
    validateYahooFinanceResponse,
    { log: () => {}, warn: () => {}, error: () => {} },
  );

  const api = new YahooFinanceAPI();

  // Helper: deep-search the result for the sentinel string. Any match
  // means the hostile payload bypassed the validator and reached the
  // caller.
  const containsSentinel = (v: unknown): boolean => {
    if (typeof v === "string") return v.includes(SENTINEL);
    if (Array.isArray(v)) return v.some(containsSentinel);
    if (v && typeof v === "object") {
      return Object.values(v as Record<string, unknown>).some(containsSentinel);
    }
    return false;
  };

  // Each method is one of the four fetch paths that must funnel through
  // the validator. We run them all and assert the sentinel does not
  // appear anywhere in their return value.
  const description = await api.getFXPairDescription("AUDUSD");
  if (description && String(description).includes(SENTINEL)) {
    throw new Error(
      `getFXPairDescription leaked hostile data: ${description}`,
    );
  }

  const validatePairResult = await api.validateFXPair("AUDUSD");
  if (containsSentinel(validatePairResult)) {
    throw new Error(
      `validateFXPair leaked hostile data: ${
        JSON.stringify(validatePairResult)
      }`,
    );
  }

  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fetchResult = await api.fetchFXData("AUDUSD", monthAgo, today);
  if (containsSentinel(fetchResult)) {
    throw new Error(
      `fetchFXData leaked hostile data: ${JSON.stringify(fetchResult)}`,
    );
  }

  const optimisedResult = await api.fetchOptimizedFXData(
    "AUDUSD",
    monthAgo,
    today,
  );
  if (containsSentinel(optimisedResult)) {
    throw new Error(
      `fetchOptimizedFXData leaked hostile data: ${
        JSON.stringify(optimisedResult)
      }`,
    );
  }
});

Deno.test("docs/index.html loads yahoo-validate.js before index.js", async () => {
  const html = await Deno.readTextFile(
    new URL("../docs/index.html", import.meta.url),
  );
  const validatorIdx = html.indexOf("yahoo-validate.js");
  const indexIdx = html.indexOf("index.js?v=");
  if (validatorIdx === -1) {
    throw new Error("docs/index.html must reference yahoo-validate.js");
  }
  if (indexIdx === -1) {
    throw new Error("Could not locate index.js script tag in docs/index.html");
  }
  if (validatorIdx > indexIdx) {
    throw new Error("yahoo-validate.js must load before index.js");
  }
});

Deno.test("docs/sw.js caches yahoo-validate.js as a static asset", async () => {
  const sw = await Deno.readTextFile(
    new URL("../docs/sw.js", import.meta.url),
  );
  if (!/["']\.\/yahoo-validate\.js["']/.test(sw)) {
    throw new Error(
      "sw.js STATIC_ASSETS must include './yahoo-validate.js' so the validator is available offline",
    );
  }
});
