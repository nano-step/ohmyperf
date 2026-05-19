# Harness Backlog

<!-- generated-by: harness-init v0.1.0 -->

Use this file when an agent discovers a missing harness capability but should
not change the operating model immediately.

## Template

```md
## Missing Harness Capability

### Title

Short name.

### Discovered While

Task or story that exposed the gap.

### Current Pain

What was hard, repeated, ambiguous, or unsafe?

### Suggested Improvement

What should be added or changed?

### Risk

Tiny, normal, or high-risk.

### Status

proposed | accepted | implemented | rejected
```

## Items

## Missing Harness Capability

### Title

INP unmeasurable on static page load (no synthetic interaction support)

### Discovered While

Experiment `llm-fix-reality-check/F3-inp-handler` — feeding an ohmyperf report
to a Claude-equivalent agent and asking it to fix an INP bug.

### Current Pain

`ohmyperf run <url>` only navigates + waits for load. INP is an interaction
metric and requires at least one event (click/tap/keypress) to fire. Today
the report shape simply OMITS the `inp` key from `aggregated` when no
interaction occurred — tool self-discloses this gap via
`meta.parity.knownDeltas.inp: "synthetic-input"` (driver-playwright/src
exports this metadata, but the CLI does not surface it to the user or to
the AI agent reading the report). The agent has to bypass the report and
inspect source code directly, defeating the purpose of measurement.

Worse downstream: OpenSpec change #5 `add-agent-fix-loop` (`verify_fix` MCP
tool) STRUCTURALLY depends on measuring INP-delta to prove a handler fix
worked. Without synthetic interaction support, `verify_fix` can only validate
LCP/CLS/TBT/FCP/TTFB — INP fixes are unverifiable.

### Suggested Improvement

Add `scenario` API to MeasureOptions accepting either:
- A Playwright callback `(page) => await page.click('#submit')` that runs
  AFTER initial navigation + before measurement window closes
- A declarative DSL: `[{type: 'wait', selector: '#q'}, {type: 'type', text:
  'hello'}, {type: 'click', selector: '#submit'}]`

Surface the warning in the report when INP-relevant scenarios were absent.

### Risk

High-risk — touches the engine's core measurement loop + plugin runtime + the
public Report schema. Requires deep-design.

### Status

proposed

---

## Missing Harness Capability

### Title

Localhost fixtures produce near-zero metrics (no default throttling)

### Discovered While

Same experiment `llm-fix-reality-check`. F1 (LCP image bug fixture with
2.4MB hero JPEG + 400ms artificial server delay) measured LCP=36ms. F5 (TBT
fixture with 800ms blocking script) measured TBT=0ms. Localhost is too fast.

### Current Pain

A standard `--mode=real` run on localhost effectively has zero network
latency, zero CPU contention, and instant DNS. Real perf bugs become
invisible. This makes it impossible to (a) write reliable fixture-based
acceptance tests for ohmyperf itself, (b) demo perf debugging to users on
their dev machines, (c) validate fixes locally before pushing to CI.

`--mode=ci-stable` does apply Fast 4G + CPU calibration but it's opt-in and
not the default. Most agents/users running `ohmyperf run http://localhost:...`
will see meaningless metrics and not know why.

### Suggested Improvement

Two complementary changes:
1. Detect localhost/127.0.0.1/file:// URLs and auto-warn:
   `[warn] localhost detected — consider --mode=ci-stable for realistic
    network + CPU throttling. Current run will show artificially low
    metrics.`
2. Add `--throttle-preset=mobile-4g|desktop-fast-3g|none` flag for finer
   control independent of mode (currently mode bundles CPU + network).

### Risk

Normal — driver-playwright + CLI flag plumbing only, no public-API change.

### Status

proposed

---

## Missing Harness Capability

### Title

Observer overhead not measured or surfaced

### Discovered While

Same experiment. PerformanceObserver (for LCP/INP/CLS attribution) +
OOPIF auto-attach (Target.setAutoAttach) + trace collection itself slow
the page being measured. ohmyperf v1 does NOT measure this overhead.
Real LCP on an idle page might be 1820ms but observers add ~50ms → reported
1870ms. The 50ms is invisible.

### Current Pain

Cross-tool comparisons (ohmyperf vs Lighthouse vs DevTools panel) are
biased by each tool's own instrumentation cost. Agents can't tell whether
a "regression" is a real change in user-perceived perf or just measurement
drift.

### Suggested Improvement

Implement vector A3 from OpenSpec change
`add-measurement-statistical-rigor`: paired ghost-run (N_instrumented +
N_ghost), subtract `overhead_p50 = median(LCP_instr - LCP_ghost)` from
headline metric, surface `report.diagnostics.measurementOverhead`.

### Risk

Normal — already designed in OpenSpec proposal #1. ~600 LOC.

### Status

accepted (designed, awaiting implementation in v2)

---

## Harness Operating Procedure

### Title

PUMP-VERSION step must update README in the same commit

### Discovered While

v0.1.0 release prep (Phase 13). Anh explicitly requested: any future
version bump must update root README.md (install instructions, examples,
version-aware text) in the SAME commit that bumps `package.json` versions.

### Current Pain

If README documents `npm install -g @ohmyperf/cli@0.1.0` but the bumped
version is 0.2.0, users install the wrong version. Manual `update README
after bump` separates the two operations and drifts.

### Suggested Improvement

1. `docs/HARNESS.md` Change Types table → add a row noting:
   `release (version bump): MUST update README.md in same commit. No exceptions.`
2. `.github/workflows/publish-stable.yml` → add a guard step BEFORE bumping
   that verifies README.md mentions the new version OR the install snippet
   is generic (no version pin); fail the workflow if neither.

### Risk

Tiny — pure documentation + a single CI guard.

### Status

implemented in this commit (HARNESS.md + workflow guard updated)
