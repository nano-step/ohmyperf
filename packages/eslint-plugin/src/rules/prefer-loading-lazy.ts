import type { Rule } from "eslint";
import { buildMeta, RULE_DOCS_BASE } from "../util.js";

const meta = buildMeta({
  description:
    "Require an explicit loading attribute on <img> and <iframe> JSX elements. Encourage loading=\"lazy\" below the fold to reduce LCP contention and bytes.",
  metrics: ["lcp"],
  url: `${RULE_DOCS_BASE}/prefer-loading-lazy.md`,
  fixable: "code",
});
meta.messages = {
  missingLoading:
    "<{{ tag }}> is missing the loading attribute. Use loading=\"lazy\" below the fold, or loading=\"eager\" for the LCP hero.",
};

export const preferLoadingLazy: Rule.RuleModule = {
  meta,
  create(context) {
    return {
      JSXOpeningElement(node: unknown): void {
        const n = node as {
          type: "JSXOpeningElement";
          name: { type: string; name?: string };
          attributes: ReadonlyArray<{
            type: string;
            name?: { type: string; name?: string };
          }>;
        };
        const elementName = n.name?.name;
        if (elementName !== "img" && elementName !== "iframe") return;
        const hasLoading = n.attributes.some((attr) => {
          if (attr.type !== "JSXAttribute") return false;
          return attr.name?.name === "loading";
        });
        if (!hasLoading) {
          context.report({
            node: node as Rule.Node,
            messageId: "missingLoading",
            data: { tag: elementName },
          });
        }
      },
    };
  },
};
