import { definePlugin, type Plugin } from "@ohmyperf/core";

export interface CwvPluginOptions {
  readonly id?: string;
}

export function cwvPlugin(opts: CwvPluginOptions = {}): Plugin {
  const id = opts.id ?? "ohmyperf.builtin.cwv";

  return definePlugin({
    id,
    version: "0.0.0-pre",
    apiVersion: "1",
    capabilities: ["metric", "collector"],
    hooks: {
      onLoad: (ctx) => {
        ctx.state.set(`${id}:loadedAt`, Date.now());
      },
      onMetric: (ctx, metric) => {
        if (
          metric.name === "lcp" ||
          metric.name === "cls" ||
          metric.name === "inp" ||
          metric.name === "fcp" ||
          metric.name === "ttfb"
        ) {
          const seen = ctx.state.get(`${id}:seen`) as Set<string> | undefined;
          if (seen) {
            seen.add(metric.name);
          } else {
            ctx.state.set(`${id}:seen`, new Set<string>([metric.name]));
          }
        }
        return undefined;
      },
    },
  });
}
