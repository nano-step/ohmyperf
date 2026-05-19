import type { LongTask, Report, Resource } from "@ohmyperf/core";
import { diffReports, type MetricDiff } from "@ohmyperf/core";

export interface ResourceDelta {
  readonly kind: "added" | "removed" | "grew" | "slowed";
  readonly url: string;
  readonly mimeType: string;
  readonly renderBlocking: boolean;
  readonly transferBytesDelta: number;
  readonly responseMsDelta: number;
}

export interface LongTaskDelta {
  readonly kind: "added" | "grew";
  readonly attribution: string;
  readonly url?: string;
  readonly durationMsDelta: number;
}

export interface RegressionHypothesis {
  readonly rank: number;
  readonly metric: string;
  readonly direction: "regression" | "improvement";
  readonly relativeDelta: number;
  readonly absoluteDelta: number;
  readonly likelyCauses: ReadonlyArray<string>;
  readonly evidence: {
    readonly newRenderBlocking: ReadonlyArray<ResourceDelta>;
    readonly grownResources: ReadonlyArray<ResourceDelta>;
    readonly newLongTasks: ReadonlyArray<LongTaskDelta>;
    readonly newThirdParties: ReadonlyArray<string>;
  };
}

export interface RegressionCauseReport {
  readonly verdict: "regressed" | "improved" | "stable" | "mixed";
  readonly summary: string;
  readonly metricDiffs: ReadonlyArray<MetricDiff>;
  readonly hypotheses: ReadonlyArray<RegressionHypothesis>;
}

const SIGNIFICANT_BYTES_DELTA = 50_000;
const SIGNIFICANT_MS_DELTA = 100;
const SIGNIFICANT_LONGTASK_MS = 50;

export function analyzeRegressionCause(
  baseline: Report,
  candidate: Report,
): RegressionCauseReport {
  const diff = diffReports(baseline, candidate);
  const metricDiffs = diff.metrics;

  const baselineRun = baseline.runs[0];
  const candidateRun = candidate.runs[0];

  const resourceDeltas = baselineRun && candidateRun
    ? diffResources(baselineRun.resources, candidateRun.resources)
    : [];
  const longTaskDeltas = baselineRun && candidateRun
    ? diffLongTasks(baselineRun.longTasks, candidateRun.longTasks)
    : [];
  const thirdPartyDeltas = diffThirdParties(baseline, candidate);

  const hypotheses: RegressionHypothesis[] = [];
  let rank = 0;
  const regressed = [...metricDiffs]
    .filter((m) => m.direction === "regression" && m.significant)
    .sort((a, b) => Math.abs(b.relativeDelta) - Math.abs(a.relativeDelta));

  for (const m of regressed) {
    rank += 1;
    const newRenderBlocking = resourceDeltas.filter(
      (d) => d.kind === "added" && d.renderBlocking,
    );
    const grownResources = resourceDeltas
      .filter((d) => d.kind === "grew" || d.kind === "slowed")
      .slice(0, 10);
    const newLongTasks = longTaskDeltas.slice(0, 10);
    hypotheses.push({
      rank,
      metric: m.metric,
      direction: "regression",
      relativeDelta: m.relativeDelta,
      absoluteDelta: m.delta,
      likelyCauses: rankCauses(m.metric, {
        newRenderBlocking,
        grownResources,
        newLongTasks,
        newThirdParties: thirdPartyDeltas,
      }),
      evidence: {
        newRenderBlocking,
        grownResources,
        newLongTasks,
        newThirdParties: thirdPartyDeltas,
      },
    });
  }

  let verdict: RegressionCauseReport["verdict"];
  const hasRegression = regressed.length > 0;
  const hasImprovement = metricDiffs.some(
    (m) => m.direction === "improvement" && m.significant,
  );
  if (hasRegression && hasImprovement) verdict = "mixed";
  else if (hasRegression) verdict = "regressed";
  else if (hasImprovement) verdict = "improved";
  else verdict = "stable";

  const summary = buildSummary(verdict, hypotheses, metricDiffs);
  return { verdict, summary, metricDiffs, hypotheses };
}

function diffResources(
  baselineList: readonly Resource[],
  candidateList: readonly Resource[],
): ResourceDelta[] {
  const baseMap = new Map(baselineList.map((r) => [r.url, r]));
  const candMap = new Map(candidateList.map((r) => [r.url, r]));
  const deltas: ResourceDelta[] = [];
  for (const [url, c] of candMap) {
    const b = baseMap.get(url);
    if (!b) {
      deltas.push({
        kind: "added",
        url,
        mimeType: c.mimeType,
        renderBlocking: c.renderBlocking,
        transferBytesDelta: c.transferSizeBytes,
        responseMsDelta: c.responseMs,
      });
      continue;
    }
    const byteDelta = c.transferSizeBytes - b.transferSizeBytes;
    const msDelta = c.responseMs - b.responseMs;
    if (Math.abs(byteDelta) >= SIGNIFICANT_BYTES_DELTA) {
      deltas.push({
        kind: byteDelta > 0 ? "grew" : "added",
        url,
        mimeType: c.mimeType,
        renderBlocking: c.renderBlocking,
        transferBytesDelta: byteDelta,
        responseMsDelta: msDelta,
      });
    } else if (msDelta >= SIGNIFICANT_MS_DELTA) {
      deltas.push({
        kind: "slowed",
        url,
        mimeType: c.mimeType,
        renderBlocking: c.renderBlocking,
        transferBytesDelta: byteDelta,
        responseMsDelta: msDelta,
      });
    }
  }
  for (const [url, b] of baseMap) {
    if (!candMap.has(url)) {
      deltas.push({
        kind: "removed",
        url,
        mimeType: b.mimeType,
        renderBlocking: b.renderBlocking,
        transferBytesDelta: -b.transferSizeBytes,
        responseMsDelta: -b.responseMs,
      });
    }
  }
  deltas.sort(
    (a, b) =>
      Math.abs(b.transferBytesDelta) + b.responseMsDelta -
      (Math.abs(a.transferBytesDelta) + a.responseMsDelta),
  );
  return deltas;
}

function diffLongTasks(
  baselineTasks: readonly LongTask[],
  candidateTasks: readonly LongTask[],
): LongTaskDelta[] {
  const baselineByAttr = new Map<string, number>();
  for (const t of baselineTasks) {
    baselineByAttr.set(t.attribution, (baselineByAttr.get(t.attribution) ?? 0) + t.duration);
  }
  const candidateByAttr = new Map<string, number>();
  for (const t of candidateTasks) {
    candidateByAttr.set(t.attribution, (candidateByAttr.get(t.attribution) ?? 0) + t.duration);
  }
  const candidateUrlByAttr = new Map<string, string | undefined>();
  for (const t of candidateTasks) {
    if (!candidateUrlByAttr.has(t.attribution)) {
      candidateUrlByAttr.set(t.attribution, t.attributionRich?.url);
    }
  }
  const deltas: LongTaskDelta[] = [];
  for (const [attr, candMs] of candidateByAttr) {
    const baseMs = baselineByAttr.get(attr) ?? 0;
    const delta = candMs - baseMs;
    if (delta < SIGNIFICANT_LONGTASK_MS) continue;
    const url = candidateUrlByAttr.get(attr);
    deltas.push({
      kind: baseMs === 0 ? "added" : "grew",
      attribution: attr,
      ...(url !== undefined ? { url } : {}),
      durationMsDelta: delta,
    });
  }
  deltas.sort((a, b) => b.durationMsDelta - a.durationMsDelta);
  return deltas;
}

function diffThirdParties(baseline: Report, candidate: Report): string[] {
  const baseTp = extractVendors(baseline);
  const candTp = extractVendors(candidate);
  const added: string[] = [];
  for (const v of candTp) if (!baseTp.has(v)) added.push(v);
  return added.sort();
}

function extractVendors(report: Report): Set<string> {
  const tp = (report.pluginData as Record<string, unknown>)["thirdParties"];
  if (!tp || typeof tp !== "object") return new Set();
  const out = new Set<string>();
  const maybeEntries = (tp as { entities?: ReadonlyArray<{ name?: string }> }).entities;
  if (Array.isArray(maybeEntries)) {
    for (const e of maybeEntries) if (typeof e.name === "string") out.add(e.name);
  }
  return out;
}

function rankCauses(
  metric: string,
  evidence: {
    newRenderBlocking: ReadonlyArray<ResourceDelta>;
    grownResources: ReadonlyArray<ResourceDelta>;
    newLongTasks: ReadonlyArray<LongTaskDelta>;
    newThirdParties: ReadonlyArray<string>;
  },
): string[] {
  const causes: string[] = [];
  const lower = metric.toLowerCase();
  if (lower === "lcp" || lower === "fcp") {
    if (evidence.newRenderBlocking.length > 0) {
      causes.push(
        `${String(evidence.newRenderBlocking.length)} new render-blocking resource(s) — most likely root cause`,
      );
    }
    if (evidence.grownResources.length > 0) {
      causes.push(
        `${String(evidence.grownResources.length)} resource(s) grew/slowed significantly`,
      );
    }
    if (evidence.newThirdParties.length > 0) {
      causes.push(
        `New third-party vendor(s): ${evidence.newThirdParties.slice(0, 5).join(", ")}`,
      );
    }
  } else if (lower === "inp" || lower === "tbt") {
    if (evidence.newLongTasks.length > 0) {
      causes.push(
        `${String(evidence.newLongTasks.length)} new/grown long task(s) — main thread blocked`,
      );
    }
    if (evidence.newThirdParties.length > 0) {
      causes.push(
        `New third-party scripts may be running on main thread: ${evidence.newThirdParties.slice(0, 5).join(", ")}`,
      );
    }
  } else if (lower === "cls") {
    if (evidence.grownResources.some((r) => r.mimeType.startsWith("image"))) {
      causes.push("Image resources changed — verify width/height attrs present");
    }
    if (evidence.newRenderBlocking.length > 0) {
      causes.push("New late-loading content may shift layout");
    }
  } else if (lower === "ttfb") {
    if (evidence.grownResources.length > 0) {
      causes.push("Document or critical resource server-response slowed");
    }
  }
  if (causes.length === 0) {
    causes.push("No structural diff matched; check infrastructure (CDN, origin, DNS) or measurement noise");
  }
  return causes;
}

function buildSummary(
  verdict: RegressionCauseReport["verdict"],
  hypotheses: ReadonlyArray<RegressionHypothesis>,
  metricDiffs: ReadonlyArray<MetricDiff>,
): string {
  const lines: string[] = [];
  lines.push(`Verdict: ${verdict.toUpperCase()}`);
  for (const m of metricDiffs) {
    if (!m.significant) continue;
    const pct = (m.relativeDelta * 100).toFixed(1);
    const sign = m.relativeDelta > 0 ? "+" : "";
    const tag =
      m.direction === "regression" ? "❌" : m.direction === "improvement" ? "✅" : "·";
    lines.push(
      `  ${tag} ${m.metric.toUpperCase()}: ${sign}${pct}% (Δ=${m.delta.toFixed(1)}, p=${m.pValue.toFixed(3)})`,
    );
  }
  if (hypotheses.length > 0) {
    lines.push("");
    lines.push("Ranked hypotheses:");
    for (const h of hypotheses) {
      lines.push(`  #${String(h.rank)} ${h.metric.toUpperCase()} regression — likely:`);
      for (const c of h.likelyCauses) lines.push(`    • ${c}`);
    }
  }
  return lines.join("\n");
}
