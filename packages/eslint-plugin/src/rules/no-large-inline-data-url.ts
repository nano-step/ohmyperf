import type { Rule } from "eslint";
import { buildMeta, getStringAttrValue, RULE_DOCS_BASE } from "../util.js";

const DEFAULT_MAX_BYTES = 4096;

const meta = buildMeta({
  description:
    "Flag inline data: URLs in <img> / <iframe> src that exceed a size threshold. Large inline data URLs bloat HTML and delay FCP/LCP.",
  metrics: ["lcp", "fcp"],
  url: `${RULE_DOCS_BASE}/no-large-inline-data-url.md`,
});
meta.messages = {
  tooLarge:
    "Inline data: URL on <{{ tag }}> is {{ size }} bytes (threshold {{ max }}). Move large assets to a separate URL so HTML can stream and FCP/LCP can render earlier.",
};
meta.schema = [
  {
    type: "object",
    properties: {
      maxBytes: { type: "number", minimum: 0 },
    },
    additionalProperties: false,
  },
];

export const noLargeInlineDataUrl: Rule.RuleModule = {
  meta,
  create(context) {
    const options = (context.options[0] ?? {}) as { maxBytes?: number };
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

    function checkAttr(tag: string, attrName: string, value: string, node: Rule.Node): void {
      if (attrName !== "src") return;
      if (!value.startsWith("data:")) return;
      const size = Buffer.byteLength(value, "utf8");
      if (size > maxBytes) {
        context.report({
          node,
          messageId: "tooLarge",
          data: { tag, size: String(size), max: String(maxBytes) },
        });
      }
    }

    return {
      JSXAttribute(node: unknown): void {
        const n = node as {
          type: "JSXAttribute";
          name: { type: string; name?: string };
          value:
            | { type: "Literal"; value: unknown }
            | { type: "JSXExpressionContainer"; expression: unknown }
            | null;
          parent?: {
            type: string;
            name?: { type: string; name?: string };
          };
        };
        if (n.name.type !== "JSXIdentifier" || n.name.name !== "src") return;
        const parent = n.parent;
        if (!parent || parent.type !== "JSXOpeningElement") return;
        const elementName = parent.name?.name;
        if (elementName !== "img" && elementName !== "iframe") return;
        const value = n.value;
        if (!value) return;
        let str: string | undefined;
        if (value.type === "Literal" && typeof value.value === "string") {
          str = value.value;
        } else if (value.type === "JSXExpressionContainer") {
          str = getStringAttrValue(value.expression as never);
        }
        if (str === undefined) return;
        checkAttr(elementName, "src", str, node as Rule.Node);
      },
    };
  },
};
