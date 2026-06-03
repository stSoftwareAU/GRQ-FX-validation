// DOM HTML-injection regression tests for the historical-range validation
// banner. Australian English: these tests guard issue #86 — an unsanitised
// FX pair name from predictions.json reaches `validationResults.innerHTML`
// via a thrown error message (`Failed to load <pair>.csv ...`). The fix
// applies contextual output encoding (`escapeHtml`) so attacker-influenced
// markup is rendered as inert text rather than parsed as HTML.
//
// Date: 03-Jun-2026

// Load the shared escapeHtml helper from docs/safe-html.js by evaluating the
// classic script in an isolated scope, mirroring the harness used by
// tests/yahoo-error-banner-xss.test.ts.
async function loadEscapeHtml(): Promise<(value: unknown) => string> {
  const src = await Deno.readTextFile(
    new URL("../docs/safe-html.js", import.meta.url),
  );
  // deno-lint-ignore no-explicit-any
  const scope: any = {};
  const factory = new Function(
    "globalThis",
    "window",
    src + "\nreturn globalThis.escapeHtml;",
  );
  return factory(scope, scope);
}

Deno.test("escapeHtml encodes all five HTML metacharacters", async () => {
  const escapeHtml = await loadEscapeHtml();
  const out = escapeHtml(`<img src=x onerror="alert('1')">&`);
  if (/[<>]/.test(out)) {
    throw new Error(`escapeHtml left raw angle brackets: ${out}`);
  }
  const expected =
    "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;";
  if (out !== expected) {
    throw new Error(`Unexpected encoding. got: ${out}`);
  }
});

Deno.test("escapeHtml coerces non-string input safely", async () => {
  const escapeHtml = await loadEscapeHtml();
  if (escapeHtml(42) !== "42") {
    throw new Error("Expected numeric input to be stringified");
  }
  if (escapeHtml(null) !== "null") {
    throw new Error("Expected null to stringify to 'null'");
  }
});

// WHAT-test: extract validateHistoricalRanges, force the CSV fetch to throw an
// Error whose message embeds attacker markup (as the real 404 path does), then
// assert the returned HTML string encodes that markup instead of carrying a
// raw element tag.
Deno.test("validateHistoricalRanges encodes attacker markup from the error message", async () => {
  const src = await Deno.readTextFile(
    new URL("../docs/index.js", import.meta.url),
  );
  const header = "async validateHistoricalRanges(comprehensiveData) {";
  const methodIdx = src.indexOf(header);
  if (methodIdx === -1) {
    throw new Error("Could not locate validateHistoricalRanges method header");
  }
  const bodyStart = src.indexOf("{", methodIdx);
  let depth = 0;
  let bodyEnd = -1;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        bodyEnd = i;
        break;
      }
    }
  }
  if (bodyEnd === -1) {
    throw new Error("Could not find the closing brace for the method");
  }
  const methodBody = src.slice(bodyStart + 1, bodyEnd);

  const escapeHtml = await loadEscapeHtml();
  const malicious =
    `</small><div style="position:fixed;inset:0">Spoofed</div><small>`;

  // The method is async; build an AsyncFunction so `await` is honoured.
  const AsyncFunction = Object.getPrototypeOf(async function () {})
    .constructor as FunctionConstructor;
  const fn = new AsyncFunction(
    "console",
    "escapeHtml",
    "formatCurrency",
    methodBody,
  ) as (
    this: unknown,
    console_: unknown,
    escape: typeof escapeHtml,
    fmt: (n: number) => string,
  ) => Promise<string>;

  const ctx = {
    selectedPair: malicious,
    // Mirrors loadFullCSVData's throw for a non-existent CSV.
    loadFullCSVData: (pair: string) => {
      throw new Error(`Failed to load ${pair}.csv from data directory`);
    },
  };

  const html = await fn.call(
    ctx,
    { error: () => {} },
    escapeHtml,
    (n: number) => String(n),
  );

  if (html.includes("<div style=")) {
    throw new Error(
      `Validation HTML must not carry a raw injected element: ${html}`,
    );
  }
  if (html.includes("</small><div")) {
    throw new Error("Raw injected markup survived into the validation HTML");
  }
  if (!html.includes("&lt;div style=")) {
    throw new Error(
      `Expected the injected markup to appear HTML-encoded; got: ${html}`,
    );
  }
});

Deno.test("docs/index.html loads safe-html.js before index.js", async () => {
  const html = await Deno.readTextFile(
    new URL("../docs/index.html", import.meta.url),
  );
  const helperIdx = html.indexOf("safe-html.js");
  const indexIdx = html.indexOf("index.js?v=");
  if (helperIdx === -1) {
    throw new Error("docs/index.html must include safe-html.js");
  }
  if (indexIdx === -1) {
    throw new Error("Could not locate index.js script tag in docs/index.html");
  }
  if (helperIdx > indexIdx) {
    throw new Error("safe-html.js must load before index.js");
  }
});
