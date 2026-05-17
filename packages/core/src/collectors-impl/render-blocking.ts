import type { Opportunity, Resource } from "../types.js";

export function computeRenderBlockingOpportunity(
  resources: ReadonlyArray<Resource>,
  fcpMs: number | undefined,
): Opportunity | undefined {
  if (typeof fcpMs !== "number" || !Number.isFinite(fcpMs) || fcpMs <= 0) return undefined;
  const blocking = resources.filter((r) => r.renderBlocking);
  if (blocking.length === 0) return undefined;
  const items = blocking
    .map((r) => {
      const totalMs = (r.requestMs ?? 0) + (r.responseMs ?? 0);
      const wastedMs = Math.max(0, Math.min(fcpMs, totalMs));
      return { url: r.url, wastedMs, wastedBytes: r.transferSizeBytes };
    })
    .sort((a, b) => (b.wastedMs ?? 0) - (a.wastedMs ?? 0));
  const totalWastedMs = items.reduce((acc, x) => acc + (x.wastedMs ?? 0), 0);
  const totalWastedBytes = items.reduce((acc, x) => acc + (x.wastedBytes ?? 0), 0);
  return {
    id: "render-blocking-resources",
    title: "Eliminate render-blocking resources",
    description:
      "Render-blocking <link rel=\"stylesheet\"> and <script> tags delay First Contentful Paint by deferring the browser's first frame until they are downloaded and parsed.",
    metric: "fcp",
    wastedMs: totalWastedMs,
    wastedBytes: totalWastedBytes,
    items,
  };
}
