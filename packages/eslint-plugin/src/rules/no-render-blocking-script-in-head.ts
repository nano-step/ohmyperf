import type { Rule } from "eslint";
import { buildMeta, getStringAttrValue, RULE_DOCS_BASE } from "../util.js";

const meta = buildMeta({
  description:
    "Disallow render-blocking <script src=...> JSX elements. Require async, defer, or type=\"module\" — parser-blocking scripts delay FCP and LCP.",
  metrics: ["lcp", "fcp"],
  url: `${RULE_DOCS_BASE}/no-render-blocking-script-in-head.md`,
});
meta.messages = {
  blocking:
    "<script src> without async/defer/type=\"module\" blocks the HTML parser and delays FCP/LCP. Add async, defer, or type=\"module\".",
};

export const noRenderBlockingScriptInHead: Rule.RuleModule = {
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
            value?: unknown;
          }>;
        };
        if (n.name?.name !== "script") return;

        let hasSrc = false;
        let hasAsync = false;
        let hasDefer = false;
        let isModule = false;
        for (const attr of n.attributes) {
          if (attr.type !== "JSXAttribute") continue;
          const an = attr.name?.name;
          if (!an) continue;
          if (an === "src") hasSrc = true;
          if (an === "async") hasAsync = true;
          if (an === "defer") hasDefer = true;
          if (an === "type") {
            const val = attr.value as
              | { type: "Literal"; value: unknown }
              | { type: "JSXExpressionContainer"; expression: unknown }
              | null
              | undefined;
            let str: string | undefined;
            if (val && val.type === "Literal" && typeof val.value === "string") str = val.value;
            else if (val && val.type === "JSXExpressionContainer") {
              str = getStringAttrValue(val.expression as never);
            }
            if (str === "module") isModule = true;
          }
        }
        if (hasSrc && !hasAsync && !hasDefer && !isModule) {
          context.report({ node: node as Rule.Node, messageId: "blocking" });
        }
      },
    };
  },
};
