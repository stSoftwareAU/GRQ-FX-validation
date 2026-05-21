// DOM XSS regression tests for the Yahoo Finance error banner renderer.
// Australian English: these tests verify that values originating from
// `predictions.json` are treated as text (not HTML and not JS source) when
// they reach `showYahooFinanceError`. They guard issue #21: a malicious
// contributor must not be able to land an XSS payload through `pair.pair`
// flowing into the error-banner sink (formerly assigned via `innerHTML`).
//
// Date: 22-May-2026

// Minimal hand-rolled DOM mock mirroring the surface used by the
// safe-error-banner helper (createElement, textContent, className,
// appendChild, replaceChildren). Kept deliberately tiny so the test
// behaves identically across Deno versions.

interface MockNode {
  tagName: string;
  _attrs: Record<string, string>;
  _children: MockNode[];
  _classes: Set<string>;
  _textContent: string;
  className: string;
  textContent: string;
  appendChild: (child: MockNode) => MockNode;
  replaceChildren: (...nodes: MockNode[]) => void;
  outerHTML: string;
}

function createElement(tag: string): MockNode {
  const node = {
    tagName: tag.toUpperCase(),
    _attrs: {} as Record<string, string>,
    _children: [] as MockNode[],
    _classes: new Set<string>(),
    _textContent: "",
  } as unknown as MockNode;

  Object.defineProperty(node, "className", {
    get() {
      return Array.from(node._classes).join(" ");
    },
    set(v: string) {
      node._classes = new Set(String(v).split(/\s+/).filter(Boolean));
    },
  });

  Object.defineProperty(node, "textContent", {
    get() {
      if (node._children.length === 0) return node._textContent;
      return node._children.map((c) => c.textContent).join("");
    },
    set(v: string) {
      node._textContent = String(v);
      node._children = [];
    },
  });

  node.appendChild = (child: MockNode) => {
    node._children.push(child);
    return child;
  };

  node.replaceChildren = (...nodes: MockNode[]) => {
    node._children = [];
    node._textContent = "";
    for (const n of nodes) node._children.push(n);
  };

  // Serialise the subtree to an HTML-ish string. Text content is HTML-encoded
  // so the test can assert on what would actually be parsed by a browser.
  Object.defineProperty(node, "outerHTML", {
    get() {
      const encode = (s: string) =>
        s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      const serialise = (n: MockNode): string => {
        if (n.tagName === "#TEXT") {
          return encode(n._textContent);
        }
        const tag = n.tagName.toLowerCase();
        const attrs: string[] = [];
        const classStr = Array.from(n._classes).join(" ");
        if (classStr) attrs.push(`class="${encode(classStr)}"`);
        for (const [k, v] of Object.entries(n._attrs)) {
          attrs.push(`${k}="${encode(v)}"`);
        }
        const attrStr = attrs.length ? " " + attrs.join(" ") : "";
        const body = n._children.length
          ? n._children.map(serialise).join("")
          : encode(n._textContent);
        return `<${tag}${attrStr}>${body}</${tag}>`;
      };
      return serialise(node);
    },
  });

  return node;
}

function createTextNode(text: string): MockNode {
  // A text node is rendered as encoded text by the parent's serialise()
  // (special-cased on tagName === "#TEXT").
  const node = createElement("#text");
  node.textContent = text;
  return node;
}

const mockDocument = { createElement, createTextNode };

async function loadRenderBanner(): Promise<
  (
    container: MockNode,
    message: string,
    doc: { createElement: (tag: string) => MockNode },
  ) => void
> {
  const src = await Deno.readTextFile(
    new URL("../docs/safe-error-banner.js", import.meta.url),
  );
  // deno-lint-ignore no-explicit-any
  const scope: any = {};
  const factory = new Function(
    "globalThis",
    "window",
    src + "\nreturn globalThis.renderYahooFinanceErrorBanner;",
  );
  return factory(scope, scope);
}

Deno.test("renderYahooFinanceErrorBanner does not interpret HTML in the message", async () => {
  const render = await loadRenderBanner();
  const container = createElement("div");
  const malicious = "<img src=x onerror=alert(1)>";
  render(container, malicious, mockDocument);
  const html = container.outerHTML;
  if (html.includes("<img")) {
    throw new Error(
      "Error banner must render the message as encoded text, never raw HTML",
    );
  }
  // The `<` from the payload must be HTML-encoded — if any unencoded `<`
  // belonging to the payload survives, an attribute like `onerror=` could be
  // parsed by a real browser.
  if (
    /<\s*[a-zA-Z]/.test(html.replace(/<\/?(?:div|small|i|br)\b[^>]*>/g, ""))
  ) {
    throw new Error(
      "Error banner must not emit raw element open tags from the message",
    );
  }
  if (!html.includes("&lt;img src=x onerror=alert(1)&gt;")) {
    throw new Error(
      "Expected the malicious message to appear as HTML-encoded text",
    );
  }
});

Deno.test("renderYahooFinanceErrorBanner renders the icon plus message text", async () => {
  const render = await loadRenderBanner();
  const container = createElement("div");
  render(
    container,
    "FX pair AUDCAD is not available on Yahoo Finance",
    mockDocument,
  );
  const html = container.outerHTML;
  // The icon node must be present.
  if (!/class="fas fa-exclamation-triangle me-1"/.test(html)) {
    throw new Error("Expected the warning icon to be rendered");
  }
  // The message text must appear as encoded text.
  if (!html.includes("FX pair AUDCAD is not available on Yahoo Finance")) {
    throw new Error("Expected the literal message text to be present");
  }
});

Deno.test("renderYahooFinanceErrorBanner replaces previous children (no accumulation)", async () => {
  const render = await loadRenderBanner();
  const container = createElement("div");
  // Prime the container with a leftover child to confirm it is removed.
  const stale = createElement("span");
  stale.textContent = "stale";
  container.appendChild(stale);

  render(container, "first call", mockDocument);
  render(container, "second call", mockDocument);

  const html = container.outerHTML;
  if (html.includes("stale")) {
    throw new Error("Banner must clear previous children before rendering");
  }
  if (html.includes("first call")) {
    throw new Error("Second render must replace the first message");
  }
  if (!html.includes("second call")) {
    throw new Error("Second render must include the new message");
  }
});

Deno.test("renderYahooFinanceErrorBanner tolerates a null container", async () => {
  const render = await loadRenderBanner();
  // Calling with null must not throw (matches the existing showYahooFinanceError
  // guard for `if (errorElement)`).
  // deno-lint-ignore no-explicit-any
  render(null as any, "ignored", mockDocument);
});

Deno.test("showYahooFinanceError in docs/index.js uses the safe banner renderer", async () => {
  // Source-level guard against regression: the old implementation
  // string-interpolated `message` into an innerHTML template literal. This
  // test ensures the unsafe pattern does not return.
  const src = await Deno.readTextFile(
    new URL("../docs/index.js", import.meta.url),
  );
  const idx = src.indexOf("showYahooFinanceError(message)");
  if (idx === -1) {
    throw new Error("Could not find showYahooFinanceError in docs/index.js");
  }
  // Read enough of the method body to cover its implementation.
  const slice = src.slice(idx, idx + 800);
  if (/errorElement\.innerHTML\s*=/.test(slice)) {
    throw new Error(
      "showYahooFinanceError still assigns to innerHTML (XSS regression)",
    );
  }
  if (!slice.includes("renderYahooFinanceErrorBanner(")) {
    throw new Error(
      "showYahooFinanceError should delegate to renderYahooFinanceErrorBanner",
    );
  }
});

Deno.test("docs/index.html loads safe-error-banner.js before index.js", async () => {
  const html = await Deno.readTextFile(
    new URL("../docs/index.html", import.meta.url),
  );
  const bannerIdx = html.indexOf("safe-error-banner.js");
  const indexIdx = html.indexOf("index.js?v=");
  if (bannerIdx === -1) {
    throw new Error("docs/index.html must include safe-error-banner.js");
  }
  if (indexIdx === -1) {
    throw new Error("Could not locate index.js script tag in docs/index.html");
  }
  if (bannerIdx > indexIdx) {
    throw new Error("safe-error-banner.js must load before index.js");
  }
});
