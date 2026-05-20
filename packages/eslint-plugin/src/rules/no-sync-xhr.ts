import type { Rule } from "eslint";
import { buildMeta, RULE_DOCS_BASE } from "../util.js";

const meta = buildMeta({
  description:
    "Disallow synchronous XMLHttpRequest. Sync XHR blocks the main thread, harming INP and TBT.",
  metrics: ["inp", "tbt"],
  url: `${RULE_DOCS_BASE}/no-sync-xhr.md`,
});
meta.messages = {
  noSync: "Synchronous XMLHttpRequest blocks the main thread (INP/TBT harm). Use fetch() or async=true.",
};

export const noSyncXhr: Rule.RuleModule = {
  meta,
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        if (callee.property.type !== "Identifier" || callee.property.name !== "open") return;
        const args = node.arguments;
        if (args.length < 3) return;
        const asyncArg = args[2];
        if (!asyncArg) return;
        if (asyncArg.type === "Literal" && asyncArg.value === false) {
          context.report({ node, messageId: "noSync" });
        }
      },
    };
  },
};
