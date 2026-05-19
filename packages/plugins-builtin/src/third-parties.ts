import { definePlugin, type Plugin, type Report, type Resource } from "@ohmyperf/core";
import nostatsSubset from "third-party-web/nostats-subset.js";

const { getEntity } = nostatsSubset as {
  getEntity: (url: string) => { name: string; category: string } | undefined;
};

interface ThirdPartyEntityItem {
  entity: string;
  category: string;
  transferSize: number;
  mainThreadTime: number;
  urls: Array<{ url: string; transferSize: number; mainThreadTime: number }>;
}

export interface ThirdPartiesPluginOptions {
  readonly id?: string;
}

export function thirdPartiesPlugin(opts: ThirdPartiesPluginOptions = {}): Plugin {
  const id = opts.id ?? "ohmyperf.builtin.third-parties";

  return definePlugin({
    id,
    version: "0.0.0-pre",
    apiVersion: "1",
    capabilities: ["audit"],
    hooks: {
      onReport: (_ctx, report: Report) => {
        const firstParty = getEntity(report.meta.url);
        const firstPartyName = firstParty?.name;
        const byEntity = new Map<string, ThirdPartyEntityItem>();

        const firstRun = report.runs[0];
        const resources: ReadonlyArray<Resource> = firstRun?.resources ?? [];
        const longTasksByUrl = new Map<string, number>();
        if (firstRun) {
          for (const t of firstRun.longTasks) {
            const url = t.attributionRich?.url;
            if (typeof url === "string") {
              longTasksByUrl.set(url, (longTasksByUrl.get(url) ?? 0) + t.duration);
            }
          }
        }

        for (const r of resources) {
          const entity = getEntity(r.url);
          if (!entity) continue;
          if (firstPartyName && entity.name === firstPartyName) continue;
          let bucket = byEntity.get(entity.name);
          if (!bucket) {
            bucket = {
              entity: entity.name,
              category: entity.category,
              transferSize: 0,
              mainThreadTime: 0,
              urls: [],
            };
            byEntity.set(entity.name, bucket);
          }
          const mtt = longTasksByUrl.get(r.url) ?? 0;
          bucket.transferSize += r.transferSizeBytes ?? 0;
          bucket.mainThreadTime += mtt;
          bucket.urls.push({ url: r.url, transferSize: r.transferSizeBytes ?? 0, mainThreadTime: mtt });
        }

        if (byEntity.size === 0) return report;

        const items = [...byEntity.values()].sort((a, b) => b.mainThreadTime - a.mainThreadTime);

        const audit = {
          id: "third-parties",
          title: `Third-party usage (${String(items.length)} entit${items.length === 1 ? "y" : "ies"})`,
          passed: true,
          score: 1 as number | null,
          details: { items },
        };

        return {
          ...report,
          audits: [...report.audits, audit],
        };
      },
    },
  });
}
