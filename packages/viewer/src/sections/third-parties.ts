import type { Report } from "@ohmyperf/core";
import { donutColorSlot, renderDonut } from "../charts/donut.js";
import { escapeHtml } from "../escape.js";
import { renderEmptyState } from "./empty-state.js";

interface VendorEntry {
  readonly name: string;
  readonly transferBytes: number;
  readonly mainThreadMs: number;
}

export function renderThirdParties(report: Report): string {
  const vendors = extractVendors(report);
  if (vendors.length === 0) {
    return `<h2>Third parties</h2>
${renderEmptyState("Third-party scripts not measured — re-run with plugins=['third-parties'].", "info")}`;
  }
  const total = vendors.reduce((s, v) => s + v.transferBytes, 0);
  const sliced = vendors.slice(0, 6);
  const others = vendors.slice(6);
  if (others.length > 0) {
    const othersBytes = others.reduce((s, v) => s + v.transferBytes, 0);
    const othersMs = others.reduce((s, v) => s + v.mainThreadMs, 0);
    sliced.push({ name: `+ ${String(others.length)} more`, transferBytes: othersBytes, mainThreadMs: othersMs });
  }

  const slices = sliced.map((v) => ({
    label: v.name,
    value: v.transferBytes,
  }));
  const donutSvg = renderDonut(slices, {
    size: 220,
    thickness: 32,
    ariaLabel: "Third-party transfer size distribution",
  });

  const legend = sliced
    .map((v, i) => {
      const pct = total > 0 ? ((v.transferBytes / total) * 100).toFixed(1) : "0.0";
      const kb = (v.transferBytes / 1024).toFixed(1);
      return `<li><span class="swatch" data-donut-slice="${String(donutColorSlot(i))}"></span><span class="label">${escapeHtml(v.name)}</span><span class="pct">${escapeHtml(`${kb} KB · ${pct}%`)}</span></li>`;
    })
    .join("");

  return `<h2>Third parties</h2>
<section class="third-parties" aria-label="Third-party breakdown">
  <div>${donutSvg}</div>
  <ul class="legend">${legend}</ul>
</section>`;
}

function extractVendors(report: Report): VendorEntry[] {
  const data = (report.pluginData as Record<string, unknown>)["thirdParties"];
  if (!data || typeof data !== "object") return [];
  const maybeEntities = (data as { entities?: ReadonlyArray<Record<string, unknown>> }).entities;
  if (!Array.isArray(maybeEntities)) return [];
  const out: VendorEntry[] = [];
  for (const e of maybeEntities) {
    const name = typeof e["entity"] === "string" ? e["entity"] : typeof e["name"] === "string" ? e["name"] : null;
    if (!name) continue;
    const transferBytes = typeof e["transferSize"] === "number" ? e["transferSize"] : 0;
    const mainThreadMs = typeof e["mainThreadTime"] === "number" ? e["mainThreadTime"] : 0;
    out.push({ name, transferBytes, mainThreadMs });
  }
  out.sort((a, b) => b.transferBytes - a.transferBytes);
  return out;
}
