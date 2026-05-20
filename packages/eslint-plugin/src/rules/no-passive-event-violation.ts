import type { Rule } from "eslint";
import { buildMeta, RULE_DOCS_BASE } from "../util.js";

const meta = buildMeta({
  description:
    "Require { passive: true } on touch/wheel/scroll listeners. Non-passive listeners block scroll/interaction and harm INP.",
  metrics: ["inp"],
  url: `${RULE_DOCS_BASE}/no-passive-event-violation.md`,
});
meta.messages = {
  missingPassive:
    "addEventListener('{{ event }}') without { passive: true } may block scroll and harm INP. Pass { passive: true } unless you call preventDefault().",
};

const PASSIVE_SENSITIVE_EVENTS = new Set([
  "touchstart",
  "touchmove",
  "touchend",
  "touchcancel",
  "wheel",
  "mousewheel",
  "scroll",
]);

export const noPassiveEventViolation: Rule.RuleModule = {
  meta,
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        if (callee.property.type !== "Identifier" || callee.property.name !== "addEventListener") return;
        const [eventNameArg, , optionsArg] = node.arguments;
        if (!eventNameArg) return;
        if (eventNameArg.type !== "Literal" || typeof eventNameArg.value !== "string") return;
        if (!PASSIVE_SENSITIVE_EVENTS.has(eventNameArg.value)) return;

        if (!optionsArg) {
          context.report({
            node,
            messageId: "missingPassive",
            data: { event: eventNameArg.value },
          });
          return;
        }
        if (optionsArg.type === "Literal" && typeof optionsArg.value === "boolean") {
          context.report({
            node,
            messageId: "missingPassive",
            data: { event: eventNameArg.value },
          });
          return;
        }
        if (optionsArg.type === "ObjectExpression") {
          const hasPassive = optionsArg.properties.some((p) => {
            if (p.type !== "Property") return false;
            if (p.key.type === "Identifier" && p.key.name === "passive") return true;
            if (p.key.type === "Literal" && p.key.value === "passive") return true;
            return false;
          });
          if (!hasPassive) {
            context.report({
              node,
              messageId: "missingPassive",
              data: { event: eventNameArg.value },
            });
          }
        }
      },
    };
  },
};
