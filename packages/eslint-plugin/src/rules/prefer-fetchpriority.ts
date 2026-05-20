import type { Rule } from "eslint";
import { buildMeta, RULE_DOCS_BASE } from "../util.js";

const meta = buildMeta({
  description:
    "Suggest fetchpriority=\"high\" on a hero <img> with priority hints. Helps the browser prioritize the LCP candidate over other resources.",
  metrics: ["lcp"],
  url: `${RULE_DOCS_BASE}/prefer-fetchpriority.md`,
});
meta.messages = {
  missingFetchPriority:
    "<img> marked as priority/hero is missing fetchpriority=\"high\". Add fetchpriority=\"high\" so the browser prioritizes the LCP candidate.",
};

const PRIORITY_FLAG_ATTRS = new Set(["priority", "data-hero", "data-lcp", "data-priority"]);

export const preferFetchpriority: Rule.RuleModule = {
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
        if (n.name?.name !== "img") return;

        let hasPriorityFlag = false;
        let hasFetchPriority = false;
        for (const attr of n.attributes) {
          if (attr.type !== "JSXAttribute") continue;
          const attrName = attr.name?.name;
          if (!attrName) continue;
          if (PRIORITY_FLAG_ATTRS.has(attrName)) hasPriorityFlag = true;
          if (attrName === "fetchPriority" || attrName === "fetchpriority") hasFetchPriority = true;
        }
        if (hasPriorityFlag && !hasFetchPriority) {
          context.report({ node: node as Rule.Node, messageId: "missingFetchPriority" });
        }
      },
    };
  },
};
