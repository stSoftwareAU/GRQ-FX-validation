// Unit tests for the script load-order helper (issue #92).
//
// These exercise the real parsing/ordering logic against crafted HTML so the
// behavioural guarantee (helper executes before app) is verified independently
// of the version-query format — the brittleness the old source-text greps had.

import {
  assertScriptLoadsBefore,
  scriptSrcOrder,
} from "./helpers/script_order.ts";

/** Minimal local assertions — keeps these tests free of external deps,
 * matching the throw-based style of the other .ts tests in this suite. */
function assertEquals(actual: string[], expected: string[]): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`Expected ${e}, got ${a}`);
  }
}

function assertThrowsWith(fn: () => void, includes: string): void {
  let thrown: Error | undefined;
  try {
    fn();
  } catch (err) {
    thrown = err instanceof Error ? err : new Error(String(err));
  }
  if (!thrown) {
    throw new Error(`Expected the call to throw (message ~ "${includes}")`);
  }
  if (!thrown.message.includes(includes)) {
    throw new Error(
      `Expected thrown message to include "${includes}"; got "${thrown.message}"`,
    );
  }
}

Deno.test("scriptSrcOrder returns script basenames in document order", () => {
  const html = `
    <script src="safe-html.js?v=1.0.110"></script>
    <script src="yahoo-validate.js?v=1.0.110"></script>
    <script src="index.js?v=1.0.110"></script>
  `;
  assertEquals(scriptSrcOrder(html), [
    "safe-html.js",
    "yahoo-validate.js",
    "index.js",
  ]);
});

Deno.test("scriptSrcOrder strips any cache-busting query and path prefix", () => {
  const html = `
    <script src="./assets/js/yahoo-validate.js?version=deadbeef"></script>
    <script src="/static/index.js"></script>
  `;
  assertEquals(scriptSrcOrder(html), ["yahoo-validate.js", "index.js"]);
});

Deno.test("scriptSrcOrder handles multi-line tags and other attributes", () => {
  const html = `
    <script
      src="safe-error-banner.js?v=1.0.110"
      defer
    ></script>
    <script src="index.js?v=1.0.110" async></script>
  `;
  assertEquals(scriptSrcOrder(html), ["safe-error-banner.js", "index.js"]);
});

Deno.test("assertScriptLoadsBefore passes when helper precedes app, any query format", () => {
  for (
    const appSrc of ["index.js?v=2.0.0", "index.js?version=abc", "index.js"]
  ) {
    const html =
      `<script src="yahoo-validate.js"></script><script src="${appSrc}"></script>`;
    // Must not throw regardless of the version-query format.
    assertScriptLoadsBefore(html, "yahoo-validate.js", "index.js");
  }
});

Deno.test("assertScriptLoadsBefore throws when helper loads after app", () => {
  const html =
    `<script src="index.js?v=1.0.0"></script><script src="yahoo-validate.js?v=1.0.0"></script>`;
  assertThrowsWith(
    () => assertScriptLoadsBefore(html, "yahoo-validate.js", "index.js"),
    "must load before",
  );
});

Deno.test("assertScriptLoadsBefore throws when the helper script is absent", () => {
  const html = `<script src="index.js?v=1.0.0"></script>`;
  assertThrowsWith(
    () => assertScriptLoadsBefore(html, "safe-error-banner.js", "index.js"),
    "Expected a <script src> for safe-error-banner.js",
  );
});

Deno.test("assertScriptLoadsBefore is not fooled by an earlier comment mention", () => {
  // The old byte-offset grep would be shifted by this comment; the parser
  // only considers real <script src> tags, so order is judged correctly.
  const html = `
    <!-- index.js?v=1.0.0 must run after yahoo-validate.js -->
    <script src="yahoo-validate.js?v=1.0.0"></script>
    <script src="index.js?v=1.0.0"></script>
  `;
  assertScriptLoadsBefore(html, "yahoo-validate.js", "index.js");
});
