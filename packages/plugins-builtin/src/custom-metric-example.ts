import { definePlugin, type Metric, type Plugin } from "@ohmyperf/core";

export interface CustomMetricExampleOptions {
  readonly id?: string;
  readonly clampLcpToMs?: number;
}

export function customMetricExamplePlugin(
  opts: CustomMetricExampleOptions = {},
): Plugin {
  const id = opts.id ?? "ohmyperf.example.custom-metric";
  const clamp = opts.clampLcpToMs;

  return definePlugin({
    id,
    version: "0.0.0-pre",
    apiVersion: "1",
    capabilities: ["metric"],
    hooks: {
      onIdle: async (ctx) => {
        const start = Date.now();
        const value = await ctx.evaluateInPage<number>(
          "document.querySelectorAll('img').length",
        );
        const elapsed = Date.now() - start;
        const imgCount = typeof value === "number" ? value : 0;
        ctx.setData({ imgCount, evalElapsedMs: elapsed });
      },
      onMetric: (_ctx, metric: Metric): Metric | undefined => {
        if (clamp !== undefined && metric.name === "lcp" && metric.value > clamp) {
          return { ...metric, value: clamp };
        }
        return undefined;
      },
    },
  });
}
