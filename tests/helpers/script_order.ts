// Helper for behavioural load-order assertions over docs/index.html.
//
// The WHAT being guarded is execution order: a helper script (e.g.
// safe-error-banner.js, yahoo-validate.js) must run before index.js so the
// global it defines exists when the app code executes. Classic <script src>
// tags execute in document order, so the order of the parsed <script>
// elements — not the raw byte offsets of substrings in the HTML source — is
// the real behavioural signal.
//
// Parsing the actual <script src> attributes (and stripping any cache-busting
// query string) makes the assertion independent of:
//   * the version-query format (?v=1.0.0, ?version=…, a content hash, none);
//   * unrelated earlier textual mentions of a filename in comments or markup;
//   * reformatting of the tags across lines.

/** Matches a `<script …>` opening tag, capturing the `src` attribute value.
 * `[^>]` spans newlines, so multi-line tags are handled. */
const SCRIPT_SRC = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

/** Reduce a script `src` to its basename without any query string, so that
 * `index.js?v=1.0.110` and `./js/index.js?version=abc` both yield `index.js`. */
function srcBasename(src: string): string {
  const withoutQuery = src.split(/[?#]/, 1)[0];
  const segments = withoutQuery.split("/");
  return segments[segments.length - 1];
}

/** Ordered basenames of every `<script src>` in document (execution) order. */
export function scriptSrcOrder(html: string): string[] {
  const order: string[] = [];
  for (const match of html.matchAll(SCRIPT_SRC)) {
    order.push(srcBasename(match[1]));
  }
  return order;
}

/** Assert that `helper` appears (and thus executes) before `app` in the
 * document's script order. Throws a descriptive Error otherwise. */
export function assertScriptLoadsBefore(
  html: string,
  helper: string,
  app: string,
): void {
  const order = scriptSrcOrder(html);
  const helperIdx = order.indexOf(helper);
  const appIdx = order.indexOf(app);
  if (helperIdx === -1) {
    throw new Error(
      `Expected a <script src> for ${helper}; found scripts: ${
        order.join(", ")
      }`,
    );
  }
  if (appIdx === -1) {
    throw new Error(
      `Expected a <script src> for ${app}; found scripts: ${order.join(", ")}`,
    );
  }
  if (helperIdx > appIdx) {
    throw new Error(
      `${helper} must load before ${app}, but appears after it (order: ${
        order.join(", ")
      })`,
    );
  }
}
