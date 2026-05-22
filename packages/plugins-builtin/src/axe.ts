import { createRequire } from "node:module";
import { definePlugin, type AuditResult, type Plugin } from "@ohmyperf/core";

const requireFromHere = createRequire(import.meta.url);

const sourceLoadState = {
  bundle: null as string | null,
  loadFailed: false,
  warnedOnce: false,
};

export interface AxePluginOptions {
  readonly id?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly maxViolationsPerRule?: number;
}

const DEFAULT_TAGS = ["wcag2a", "wcag2aa"] as const;

interface AxeViolation {
  id: string;
  impact?: string | null;
  description?: string;
  help?: string;
  helpUrl?: string;
  tags?: ReadonlyArray<string>;
  nodes?: ReadonlyArray<{
    target?: ReadonlyArray<string>;
    failureSummary?: string;
    html?: string;
  }>;
}

interface AxeResults {
  violations: ReadonlyArray<AxeViolation>;
  passes?: ReadonlyArray<AxeViolation>;
  incomplete?: ReadonlyArray<AxeViolation>;
}

export function axePlugin(opts: AxePluginOptions = {}): Plugin {
  const id = opts.id ?? "ohmyperf.builtin.axe";
  const tags = opts.tags ?? DEFAULT_TAGS;
  const cap = opts.maxViolationsPerRule ?? 5;

  return definePlugin({
    id,
    version: "0.0.0-pre",
    apiVersion: "1",
    capabilities: ["audit"],
    hooks: {
      onIdle: async (ctx) => {
        ctx.recordCapabilityUse("audit");
        if (sourceLoadState.loadFailed) {
          return;
        }
        let bundle: string | null = sourceLoadState.bundle;
        if (!bundle) {
          try {
            const axePath = requireFromHere.resolve("axe-core/axe.min.js");
            const fs = await import("node:fs/promises");
            bundle = await fs.readFile(axePath, "utf8");
            sourceLoadState.bundle = bundle;
          } catch (err) {
            sourceLoadState.loadFailed = true;
            if (!sourceLoadState.warnedOnce) {
              sourceLoadState.warnedOnce = true;
              ctx.logger.info(
                "axe-plugin: accessibility audit skipped (axe-core not resolvable). Install @ohmyperf/plugins-builtin with axe-core peer to enable.",
                { error: err instanceof Error ? err.message : String(err) },
              );
            }
            return;
          }
        }

        const installResult = await ctx.evaluateInPage<{ ok: boolean; error?: string }>(
          `(function () {
             try {
               ${bundle}
               return { ok: typeof window.axe === "object" };
             } catch (e) {
               return { ok: false, error: String(e && e.message || e) };
             }
           })()`,
        );
        if (!installResult || !installResult.ok) {
          ctx.logger.warn("axe-plugin: in-page axe install failed", {
            error: installResult?.error ?? "unknown",
          });
          return;
        }

        const tagsLiteral = JSON.stringify(tags);
        const runResult = await ctx.evaluateInPage<AxeResults | { __error: string }>(
          `(async function () {
             try {
               return await window.axe.run(document, { runOnly: { type: "tag", values: ${tagsLiteral} }, resultTypes: ["violations"] });
             } catch (e) {
               return { __error: String(e && e.message || e) };
             }
           })()`,
        );
        if (!runResult || ("__error" in runResult)) {
          ctx.logger.warn("axe-plugin: axe.run failed", {
            error: runResult && "__error" in runResult ? runResult.__error : "unknown",
          });
          return;
        }

        const results = runResult as AxeResults;
        const violations = results.violations ?? [];
        const summary = violations.map((v) => ({
          id: v.id,
          impact: v.impact ?? null,
          help: v.help ?? null,
          helpUrl: v.helpUrl ?? null,
          tags: v.tags ?? [],
          nodes: (v.nodes ?? []).slice(0, cap).map((n) => ({
            target: n.target ?? [],
            failureSummary: n.failureSummary ?? null,
            html: typeof n.html === "string" ? n.html.slice(0, 500) : null,
          })),
          totalNodes: (v.nodes ?? []).length,
        }));

        ctx.setData({
          tags,
          violationCount: violations.length,
          violations: summary,
        });

        const audit: AuditResult = {
          id: "a11y.axe-violations",
          title: "Accessibility violations (axe-core)",
          score: violations.length === 0 ? 1 : 0,
          passed: violations.length === 0,
          status: violations.length === 0 ? "pass" : "fail",
          details: { count: violations.length, top: summary.slice(0, 10) },
        };
        ctx.audit(audit);
      },
    },
  });
}
