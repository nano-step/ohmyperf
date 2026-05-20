import type { Rule } from "eslint";
import { buildMeta, RULE_DOCS_BASE } from "../util.js";

const meta = buildMeta({
  description:
    "Disallow document.write / document.writeln. They block HTML parsing and catastrophically delay LCP and FCP.",
  metrics: ["lcp", "fcp"],
  url: `${RULE_DOCS_BASE}/no-document-write.md`,
});
meta.messages = {
  noWrite: "document.{{ name }}() blocks parsing and catastrophically delays LCP/FCP. Use DOM APIs instead.",
};

export const noDocumentWrite: Rule.RuleModule = {
  meta,
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        const object = callee.object;
        const property = callee.property;
        if (object.type !== "Identifier" || object.name !== "document") return;
        if (property.type !== "Identifier") return;
        if (property.name !== "write" && property.name !== "writeln") return;
        context.report({
          node,
          messageId: "noWrite",
          data: { name: property.name },
        });
      },
    };
  },
};
