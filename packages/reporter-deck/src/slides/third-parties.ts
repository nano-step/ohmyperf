import type { Report } from "@ohmyperf/core";
import { donutColorAt, renderDonut } from "@ohmyperf/viewer/charts";
import { escapeHtml } from "@ohmyperf/viewer/escape";
import { slideWrapper } from "../deck-shell.js";
import { renderEmptyStateSlide } from "./empty-slide.js";

interface VendorEntry {
  readonly name: string;
  readonly transferBytes: number;
  readonly mainThreadMs: number;
}

export function renderThirdPartiesSlide(report: Report): string {
  const vendors = extractVendors(report);
  if (vendors.length === 0) {
    return renderEmptyStateSlide(4, {
      title: "Third parties",
      eyebrow: "Section 04 · Third parties",
      message: "Third-party scripts were not measured. Re-run with plugins=['third-parties'].",
      icon: "·",
    });
  }
  const total = vendors.reduce((s, v) => s + v.transferBytes, 0) || 1;
  const top = vendors.slice(0, 5);
  const slices = top.map((v, i) => ({ label: v.name, value: v.transferBytes, color: donutColorAt(i) }));
  const donut = renderDonut(slices, { size: 320, thickness: 48, ariaLabel: "Third-party transfer size distribution" });
  const legend = top
    .map((v, i) => {
      const pct = ((v.transferBytes / total) * 100).toFixed(1);
      const kb = (v.transferBytes / 1024).toFixed(0);
      return `<li><span class="swatch" style="background:${donutColorAt(i)}"></span><span style="flex:1">${escapeHtml(v.name)}</span><span class="pct">${escapeHtml(`${kb} KB · ${pct}%`)}</span></li>`;
    })
    .join("");

  const inner = `  <h2 class="slide-title">Third parties</h2>
  <p class="slide-subtitle"><strong>${escapeHtml(String(vendors.length))}</strong> distinct vendor${vendors.length === 1 ? "" : "s"} loaded · <strong>${(total / 1024).toFixed(0)} KB</strong> total transfer</p>
  <div class="slide-body deck-third-parties">
    <div>${donut}</div>
    <ul class="legend">${legend}</ul>
  </div>
  <footer class="slide-footer"><span>Top 5 by transfer size</span><span>OhMyPerf</span></footer>`;
  return slideWrapper(4, inner, { eyebrow: "Section 04 · Third parties" });
}

function extractVendors(report: Report): VendorEntry[] {
  const data = (report.pluginData as Record<string, unknown>)["thirdParties"];
  if (!data || typeof data !== "object") return [];
  const maybe = (data as { entities?: ReadonlyArray<Record<string, unknown>> }).entities;
  if (!Array.isArray(maybe)) return [];
  const out: VendorEntry[] = [];
  for (const e of maybe) {
    const name = typeof e["entity"] === "string" ? e["entity"] : typeof e["name"] === "string" ? e["name"] : null;
    if (!name) continue;
    const transferBytes = typeof e["transferSize"] === "number" ? e["transferSize"] : 0;
    const mainThreadMs = typeof e["mainThreadTime"] === "number" ? e["mainThreadTime"] : 0;
    out.push({ name, transferBytes, mainThreadMs });
  }
  out.sort((a, b) => b.transferBytes - a.transferBytes);
  return out;
}
