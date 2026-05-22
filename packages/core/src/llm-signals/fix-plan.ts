import { createHash } from "node:crypto";
import type {
  FixArchetypeId,
  FixEffort,
  FixPlanEntry,
  OriginClass,
  Report,
  Resource,
} from "../types.js";

interface MimeIndex {
  readonly byUrl: ReadonlyMap<string, string>;
  readonly originClassByUrl: ReadonlyMap<string, OriginClass | undefined>;
}

function buildMimeIndex(report: Report): MimeIndex {
  const mimeByUrl = new Map<string, string>();
  const originByUrl = new Map<string, OriginClass | undefined>();
  for (const run of report.runs) {
    for (const r of run.resources) {
      if (!mimeByUrl.has(r.url) && r.mimeType) mimeByUrl.set(r.url, r.mimeType);
      if (!originByUrl.has(r.url) && r.originClass) originByUrl.set(r.url, r.originClass);
    }
  }
  return { byUrl: mimeByUrl, originClassByUrl: originByUrl };
}

type ResourceKind = "script" | "stylesheet" | "image" | "document" | "unknown";

function classifyByUrl(url: string): ResourceKind {
  const lower = url.toLowerCase().split("?")[0] ?? "";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "script";
  if (lower.endsWith(".css")) return "stylesheet";
  if (/\.(png|jpe?g|webp|avif|gif|svg)$/.test(lower)) return "image";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "document";
  return "unknown";
}

function classifyByMime(mime: string | undefined): ResourceKind {
  if (!mime) return "unknown";
  const lower = mime.toLowerCase();
  if (lower.includes("javascript") || lower === "application/ecmascript") return "script";
  if (lower.includes("css")) return "stylesheet";
  if (lower.startsWith("image/")) return "image";
  if (lower.includes("html")) return "document";
  return "unknown";
}

function resourceKind(url: string, mime: string | undefined): ResourceKind {
  const byUrl = classifyByUrl(url);
  if (byUrl !== "unknown") return byUrl;
  return classifyByMime(mime);
}

function basename(url: string): string {
  try {
    const u = new URL(url);
    const tail = u.pathname.split("/").filter(Boolean).pop();
    return tail || u.host;
  } catch {
    return url;
  }
}

function archetypeFor(
  kind: ResourceKind,
  oppId: string,
): { archetype: FixArchetypeId; preview: (b: string) => string; rationale: string; confidence: "high" | "medium" | "low"; effort: FixEffort } | null {
  if (oppId === "render-blocking-resources") {
    if (kind === "script") {
      return {
        archetype: "render-blocking-script-add-defer",
        preview: (b) => `<script src="${b}" defer>`,
        rationale: "Add `defer` to non-critical script tags so they download in parallel without blocking parsing. Lowest-risk perf fix.",
        confidence: "high",
        effort: "one-line",
      };
    }
    if (kind === "stylesheet") {
      return {
        archetype: "render-blocking-stylesheet-media-print",
        preview: (b) => `<link rel="stylesheet" href="${b}" media="print" onload="this.media='all'">`,
        rationale: "Use the media=print + onload swap pattern to download stylesheet without blocking first paint. Add <noscript> fallback for JS-off clients.",
        confidence: "medium",
        effort: "one-line",
      };
    }
  }
  if (oppId === "largest-contentful-paint-image" || oppId === "preload-lcp-image") {
    if (kind === "image") {
      return {
        archetype: "lcp-image-fetchpriority-high",
        preview: (b) => `<img src="${b}" fetchpriority="high" loading="eager">`,
        rationale: "Mark the LCP image as fetchpriority=high so the browser prioritizes its download. Combine with rel=preload for further improvement.",
        confidence: "high",
        effort: "one-line",
      };
    }
  }
  return null;
}

function effortAdjustedRoi(impactMs: number, confidence: "high" | "medium" | "low", effort: FixEffort): number {
  const confidenceFactor = confidence === "high" ? 1 : confidence === "medium" ? 0.65 : 0.35;
  const effortPenalty = effort === "one-line" ? 1 : effort === "config" ? 0.8 : 0.4;
  return impactMs * confidenceFactor * effortPenalty;
}

function makeId(archetype: string, url: string): string {
  return createHash("sha256").update(`${archetype}|${url}`).digest("hex").slice(0, 12);
}

function applicabilityFromOrigin(originClass: OriginClass | undefined): "first-party" | "third-party-cannot-apply" | "unknown" {
  if (
    originClass === "same-origin" ||
    originClass === "same-site" ||
    originClass === "same-org"
  ) {
    return "first-party";
  }
  if (originClass === "cross-site") return "third-party-cannot-apply";
  return "unknown";
}

function findOriginClassFromResources(url: string, report: Report): OriginClass | undefined {
  for (const run of report.runs) {
    for (const r of run.resources) {
      if (r.url === url) return r.originClass;
    }
  }
  return undefined;
}

export function buildFixPlan(report: Report): ReadonlyArray<FixPlanEntry> {
  const opps = (() => {
    const all: typeof report.opportunities = [];
    if (report.opportunities) {
      for (const o of report.opportunities) (all as Array<(typeof all)[number]>).push(o);
    }
    for (const run of report.runs) {
      if (!run.opportunities) continue;
      for (const o of run.opportunities) {
        if (!(all as Array<(typeof all)[number]>).some((e) => e.id === o.id)) {
          (all as Array<(typeof all)[number]>).push(o);
        }
      }
    }
    return all ?? [];
  })();

  if (opps.length === 0) return [];

  const idx = buildMimeIndex(report);

  type Draft = Omit<FixPlanEntry, "rank">;
  const drafts: Draft[] = [];
  const seen = new Set<string>();

  for (const opp of opps) {
    const itemWastedMsValues = opp.items
      .map((it) => it.wastedMs)
      .filter((v): v is number => typeof v === "number");
    const uniqueWastedMs = new Set(itemWastedMsValues);
    const wastedMsLooksEstimated =
      itemWastedMsValues.length >= 3 && uniqueWastedMs.size <= Math.max(1, Math.floor(itemWastedMsValues.length / 3));

    for (const item of opp.items) {
      const url = item.url;
      const mime = idx.byUrl.get(url);
      const kind = resourceKind(url, mime);
      const matched = archetypeFor(kind, opp.id);
      if (!matched) continue;
      const id = makeId(matched.archetype, url);
      if (seen.has(id)) continue;
      seen.add(id);
      const originClass = idx.originClassByUrl.get(url) ?? findOriginClassFromResources(url, report);
      const impact = item.wastedMs ?? opp.wastedMs ?? 0;
      const adjustedConfidence: "high" | "medium" | "low" = wastedMsLooksEstimated
        ? (matched.confidence === "high" ? "medium" : "low")
        : matched.confidence;
      const roi = effortAdjustedRoi(impact, adjustedConfidence, matched.effort);
      const base = basename(url);
      const expectedMetric = opp.metric;
      const target: { url: string; originClass?: OriginClass } = originClass !== undefined
        ? { url, originClass }
        : { url };
      drafts.push({
        id,
        archetype: matched.archetype,
        target,
        expectedImpactMs: impact,
        expectedMetric,
        confidence: adjustedConfidence,
        roiScore: roi,
        effort: matched.effort,
        applicability: applicabilityFromOrigin(originClass),
        patchPreview: matched.preview(base),
        rationale: matched.rationale,
      });
    }
  }

  drafts.sort((a, b) => {
    if (a.applicability === "third-party-cannot-apply" && b.applicability !== "third-party-cannot-apply") return 1;
    if (b.applicability === "third-party-cannot-apply" && a.applicability !== "third-party-cannot-apply") return -1;
    return b.roiScore - a.roiScore;
  });

  const grouped = collapseSameArchetype(drafts);

  return grouped.map((d, i) => ({ ...d, rank: i + 1 }));
}

function collapseSameArchetype(drafts: ReadonlyArray<Omit<FixPlanEntry, "rank">>): Array<Omit<FixPlanEntry, "rank">> {
  type Draft = Omit<FixPlanEntry, "rank">;
  const byKey = new Map<string, { primary: Draft; siblings: Draft[] }>();
  const order: string[] = [];
  for (const d of drafts) {
    const key = `${d.archetype}|${d.expectedMetric}|${d.target.originClass ?? ""}`;
    const bucket = byKey.get(key);
    if (!bucket) {
      byKey.set(key, { primary: d, siblings: [] });
      order.push(key);
    } else {
      bucket.siblings.push(d);
    }
  }
  return order.map((key) => {
    const bucket = byKey.get(key)!;
    if (bucket.siblings.length === 0) return bucket.primary;
    const all = [bucket.primary, ...bucket.siblings];
    const totalImpactMs = all.reduce((acc, x) => acc + x.expectedImpactMs, 0);
    const targets = all
      .map((x) => {
        const t: { url: string; originClass?: OriginClass; expectedImpactMs: number } = {
          url: x.target.url,
          expectedImpactMs: x.expectedImpactMs,
        };
        if (x.target.originClass !== undefined) t.originClass = x.target.originClass;
        return t;
      })
      .sort((a, b) => b.expectedImpactMs - a.expectedImpactMs);
    return {
      ...bucket.primary,
      expectedImpactMs: totalImpactMs,
      targets,
    };
  });
}
