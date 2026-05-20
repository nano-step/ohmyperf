import type { Rule } from "eslint";

export type Metric = "lcp" | "fcp" | "inp" | "cls" | "tbt" | "ttfb";

export interface OhmyperfRuleMeta {
  readonly description: string;
  readonly metrics: ReadonlyArray<Metric>;
  readonly url: string;
}

export function buildMeta(opts: OhmyperfRuleMeta & { readonly fixable?: "code" | "whitespace" }): Rule.RuleMetaData {
  const meta: Rule.RuleMetaData = {
    type: "problem",
    docs: {
      description: opts.description,
      url: opts.url,
    },
    schema: [],
    messages: {},
  };
  if (opts.fixable !== undefined) {
    meta.fixable = opts.fixable;
  }
  return meta;
}

interface MaybeStringLiteral {
  readonly type: string;
  readonly value?: unknown;
}
interface MaybeTemplateLiteral {
  readonly type: string;
  readonly quasis?: ReadonlyArray<{ value: { cooked?: string; raw: string } }>;
  readonly expressions?: ReadonlyArray<unknown>;
}

export function getStringAttrValue(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const node = value as MaybeStringLiteral & MaybeTemplateLiteral;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (
    node.type === "TemplateLiteral" &&
    Array.isArray(node.quasis) &&
    node.quasis.length === 1 &&
    Array.isArray(node.expressions) &&
    node.expressions.length === 0
  ) {
    const first = node.quasis[0];
    return first?.value.cooked ?? first?.value.raw;
  }
  return undefined;
}

export const RULE_DOCS_BASE = "https://github.com/hoainho/ohmyperf/blob/main/packages/eslint-plugin/docs/rules";
