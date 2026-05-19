# Proposal: LLM-Native Taxonomy + Source Maps (OpenSpec Change #2 of 5)

## Why

ohmyperf v2's strategic moat rests on **two** properties:

1. **Provable measurement accuracy** (covered by change #1 `add-ground-truth-validation-harness`).
2. **LLM-native output** — a Report that an AI coding agent can consume directly and use to **fix the bug** without a human translator in the loop.

Today, change #1 makes us trustworthy; nothing in the codebase makes us *useful to an agent*. Five concrete gaps prevent agent consumption:

1. **Audit IDs are free-form strings.** `audits[].id` is "render-blocking-resources" in one place, "LCP image too large" elsewhere, free-text per plugin. An LLM cannot pattern-match against a closed vocabulary and cannot reliably look up canonical fixes. There is no schema-validated registry of failure modes.
2. **Attribution stops at a URL.** When a LongTask blames `https://cdn.foo.com/app.a8f3c.js:1:54328`, an agent sees a minified URL and has no path back to the user's source tree (`src/components/Hero.tsx:47`). Source maps exist on disk but ohmyperf never reads them.
3. **No injection attribution.** When a third-party script (`intercom.js`, `gtm.js`) tanks INP, the user wants to know *which line of their code added the `<script>` tag* — `app/layout.tsx:23` or `pages/_app.tsx:layout-effect:18`. Today ohmyperf only records the script URL, not the inserter.
4. **No "what's missing" diagnoses.** ohmyperf only sees what loaded. It cannot say "you forgot to preload your LCP image" or "your fonts are missing `font-display: swap`." A 90%-of-real-LLM-fixes class of bugs is *absence of correct config*, not presence of bad code.
5. **No reproducibility guarantee.** Diagnoses today depend on free-form audit logic — re-running on the same fixture can produce slightly different audit text and ordering. Agents need *byte-stable* diagnoses keyed to a stable ID space.

This change ships the four primitives an AI agent needs to read a Report and emit a usable code change:

- **Closed-vocabulary failure-mode taxonomy** (a registered ID = a known repair archetype)
- **Source-mapped attribution** (every blame URL points back into the user's source tree)
- **Injection attribution** (every script can be traced back to the line that injected it)
- **Negative-space audits** (we surface what's missing, not just what's there)

## What changes

### Added (engine layer — `packages/core`)

- **`packages/core/src/taxonomy/v1.ts`** — NEW. Frozen `TAXONOMY_V1` registry as `Object.freeze({...} as const satisfies Record<string, TaxonomyEntry>)`. Twelve archetypes in v1 (cut down from the originally-proposed ~30 — see "Pinned design decisions" §MVA-cut). Each entry declares `{ metric, severity, repairArchetype, docUrl }`. Exports `type TaxonomyId = keyof typeof TAXONOMY_V1`. **Taxonomy is a leaf module** — it imports nothing from `collectors-impl/`, `insights/`, or anywhere else. Reverse-direction only.
- **`packages/core/src/taxonomy/index.ts`** — barrel re-exporting `TAXONOMY_V1`, `TaxonomyId`, `TaxonomyEntry`, and the helper `getTaxonomyEntry(id)`.
- **`packages/core/src/types.ts`** additions (all optional, additive only — schema stays at `"1.0.0"`):
  - `Diagnosis` interface: `{ id: TaxonomyId; metric; severity; subjects: ReadonlyArray<DiagnosisSubject>; repairArchetype: string; docUrl: string }`.
  - `DiagnosisSubject`: `{ selector?: string; url?: string; sourceLocation?: SourceLocation; estimatedImpactMs?: number; estimatedImpactPercent?: number }`.
  - `AbsenceFinding`: `{ id: TaxonomyId; subject: { selector?: string; url?: string; count: number }; expected: string; expectedLocation?: SourceLocation | { kind: 'response-header'; resourceUrl: string; header: string }; estimatedImpact?: { metric: string; deltaMs?: number } }`.
  - `SourceLocation`: `{ file: string; line: number; column: number; function?: string; sourceMapHash?: string; codeWindowRef?: ArtifactRef }`. **Code window is NOT inlined**; the window lives in a side artifact (sha256+size). Inline-default fields: `file/line/column/function` only.
  - Optional sibling fields on existing types:
    - `MetricAttribution.sourceLocation?: SourceLocation` (NOT a breaking change to existing `MetricAttribution.element/subparts`).
    - `LongTask.sourceLocation?: SourceLocation` (NEW field; existing `LongTask.attribution: string` and the change-#1-area `LongTask.attributionRich?` field are untouched).
    - `Resource.injectionPath?: ReadonlyArray<SourceLocation>` (chain from the line that added `<script>` back through TMS-style injectors; first entry is the immediate inserter).
  - New top-level optional Report fields:
    - `Report.diagnoses?: ReadonlyArray<Diagnosis>` — preferred machine-readable surface for AI agents.
    - `Report.absences?: ReadonlyArray<AbsenceFinding>` — negative-space findings.
    - `Report.taxonomyVersion?: string` — string literal `"v1"` for this change; mismatch detection lives in reader code.
    - `Report.warnings?: ReadonlyArray<{ id: string; count?: number; detail?: string }>` — additive optional. **Hoisted to top-level Report** (does NOT live on `ReportMeta`). Plugins emit by returning a new `Report` with `warnings: [...existing, ...new]` from their `onReport` hook (`Report` is deep-readonly; no `.push` allowed).
    - `Report.degradations?: ReadonlyArray<{ capability: PluginDegradationCapability; reason: string }>` — additive optional, also hoisted to top-level Report (existing `ReportMeta.degradations` is reserved for `DriverCapability` and is **not extended** by this change). `PluginDegradationCapability` is a NEW string union introduced in `types.ts` covering plugin-level capability degradations: `'source-maps' | 'injection-attribution' | 'absences' | 'diagnoser'`. **Kept distinct from `DriverCapability`** to avoid widening that closed union.
  - **`Report.audits` is retained verbatim**. Old consumers still work. New consumers prefer `diagnoses`.
  - **`pluginData` placement** for the DOM snapshot: `RunReport.pluginData?: Readonly<Record<string, unknown>>` is added as an additive optional field (current `Report.pluginData` covers report-level data; absence snapshots are per-run because `onIdle` fires per-run). Snapshot key: `'ohmyperf:domSnapshot'`. Multi-run determinism: absences are computed against `report.runs[0].pluginData['ohmyperf:domSnapshot']` only (the first/cold run) — see Design §multi-run-determinism.

### Added (new package — `packages/sourcemaps`)

- **`packages/sourcemaps/`** — NEW workspace package, name `@ohmyperf/sourcemaps`. Pulls in `@jridgewell/trace-mapping` (~20KB, zero deps; chosen over Mozilla `source-map` which is WASM-async, and over `@jridgewell/source-map` which is just a wrapper). Exposes:
  - `sourceMapResolverPlugin(config: SourceMapConfig): OhMyPerfPlugin` — registered at `pluginRuntime.onReport` boundary. Returns a new `Report` (deep-readonly) with `longTask.sourceLocation`, `resource.injectionPath[*]` rewritten, and `warnings`/`degradations` arrays extended. Missing maps → leave field undefined + append to `report.warnings` (returned-new-Report pattern; never `.push`).
  - `SourceMapConfig`: `{ sourceMaps: 'auto' | 'disabled' | { sources: Array<{ url: string; mapPath: string }> }; repoRoot: string; codeWindow?: 'none' | 'inline' | 'artifact' }`. Default `codeWindow: 'artifact'` (see Bundle-budget protection §below).
  - Offline only — never makes a network request. Auto-discovery reads `//# sourceMappingURL=...` from the script bytes (already in memory via Network domain) or sibling `.js.map` files under `repoRoot`. **Path traversal forbidden**: any resolved map path must be inside `repoRoot` (Windows-aware: forward-slash mixing normalized; UNC paths rejected; symlinks resolved before the boundary check; case-insensitive drive letter compare on Win32).
  - Hash discipline: every successfully-resolved location carries `sourceMapHash` (hex sha256 of the `.map` file's raw bytes). Resolver caches `TraceMap` instances keyed by `mapPath` (NOT hash — two distinct scripts can in theory share an `rsync`-ed map; hash is a witness, not a cache key).
  - **Virtual source handling**: Vite (`/@id/...`), webpack v3 index maps, and esbuild inline (`data:application/json;base64,...`) maps are supported via `@jridgewell/trace-mapping`. Virtual paths (those not under `repoRoot` and not openable on disk) resolve to a synthetic `SourceLocation` with `file: '<virtual:' + originalPath + '>'` and `codeWindowRef: undefined` — NOT an error.
  - **Plugin context extension**: `@ohmyperf/sourcemaps` needs to emit code-window artifacts. Since current `ReportCtx` only exposes `{ logger }` and `Report.artifacts` is a closed shape (`traceRef? | harRef? | screenshotsRef? | heapRef?`), this change adds `Report.artifacts.codeWindowRefs?: ReadonlyArray<ArtifactRef>` (additive optional) and exposes an artifact-writer surface on the new plugin path. See tasks B5.5 for the `ReportCtx` extension contract.
- **`packages/sourcemaps` is a Node-only package** (depends on `node:fs`, `node:crypto`). It is registered into the default plugin list **only for the CLI/runner**, not for the chrome-extension surface — the extension surface emits `degradation: { capability: 'source-maps', reason: 'extension-fs-unavailable' }` and proceeds.

### Added (engine — collectors)

- **`packages/core/src/collectors-impl/injection-shim.ts`** — NEW. The TS-source form of the in-page shim. Patches `Document.prototype.createElement` (so script elements get a `__omp_created_stack` property at creation time) and `Node.prototype.appendChild`/`insertBefore`/`replaceChild` (so the **emit happens only on DOM insertion**, not on `src` setter; this avoids leaks from short-lived "created but never appended" elements and avoids double-emit when frameworks reuse nodes). The `HTMLScriptElement.src` setter is also patched but ONLY to refresh `__omp_created_stack` if `src` is reassigned before insertion. On insertion, the shim pushes a `{ kind: 'omp.inj', src, stack }` record to `window.__ohmyperf_injections = []`. Re-entrancy guard: a WeakSet of already-emitted script elements prevents double-emit. **Stringified at build time** via `scripts/build-inline-scripts.ts` (the existing pipeline that already produces `cwv-inline-script.ts`). Build output: `INJECTION_SHIM_SRC: string`.
- **`packages/core/src/collectors-impl/injection-collector.ts`** — NEW. Installs the shim via `Page.addScriptToEvaluateOnNewDocument({ source: INJECTION_SHIM_SRC, runImmediately: true })` — the same install path `cwv-collector.ts` and `longtask-collector.ts` already use. **Data-readback path mirrors the existing polling pattern**: the shim accumulates injection records on `window.__ohmyperf_injections = []`; at `finalize()`, the collector reads via `Runtime.evaluate("JSON.stringify(window.__ohmyperf_injections)")`. (NOTE: this is the existing collector pattern. CDP `Runtime.addBinding` / `Runtime.bindingCalled` is **not** currently used anywhere in ohmyperf — keeping the polling pattern preserves a single mental model and avoids introducing a new CDP primitive across OOPIF + fenced-frame surfaces. A future ADR may introduce `addBinding` as a uniform upgrade across all collectors; that's a separate change.) On readback, the collector parses each record's `stack` into a raw `SourceLocation[]` (top frame first) using a V8 stack-format regex (`at <fn> (<url>:<line>:<col>)`). The raw entries carry the minified URL as `file` (transient lifecycle state, see Design §SourceLocation-lifecycle). At `finalize()`, attaches the captured raw stacks to the corresponding `Resource.injectionPath`; `@ohmyperf/sourcemaps` then rewrites them to source-tree paths during its own `onReport` hook.
- **`packages/core/src/collectors-impl/dom-snapshot.ts`** — NEW. At `onIdle()`, captures a deterministic minimal DOM snapshot used by the absences engine: `<img>` (selector, has-width, has-height, src, isLcp), `<link>` (selector, rel, href, has-as), `<script src>` (selector, src, has-async, has-defer, has-type-module), `<style>` (selector, inline-bytes), per-`Resource` response headers (cache-control, content-encoding, content-type, content-length). Stored as `report.runs[*].pluginData['ohmyperf:domSnapshot']`. Determinism contract: snapshot is taken **once at `onIdle`**; absences engine operates **only** on the snapshot, never re-queries DOM.

### Added (new plugin — diagnoser)

- **`packages/plugins-builtin/src/diagnoser.ts`** — NEW. The "audits → diagnoses + absences" plugin. Two passes at `onReport`:
  1. **Diagnosis emission**: walks `report.runs[*].audits`, applies the static `AUDIT_TO_DIAGNOSIS` mapping table to lift recognized audits into typed `Diagnosis` records. Audits with no mapping are left untouched in `audits[]` (we do NOT emit a `Diagnosis` for an unmapped audit — silent renaming would devalue the taxonomy).
  2. **Absence emission**: runs the five `AbsenceCheck` functions (one per v1 absence ID) against the frozen DOM snapshot + resource list + headers. Each check is a pure function: `(snapshot, resources, metrics) => AbsenceFinding | null`. Order is fixed (file-order of `AbsenceChecks[]` array). Output is sorted by `subject.url || subject.selector` (lexicographic) so byte-equal across runs.
- **`packages/plugins-builtin/src/diagnoser-mapping.ts`** — NEW. Frozen `AUDIT_TO_DIAGNOSIS: Record<string, TaxonomyId>` mapping table. Governed by ADR-006 (see below) — additions are non-breaking, deletions or remappings require a taxonomy version bump.

### Added (governance — ADR)

- **`openspec/adrs/ADR-006-taxonomy-stability-and-versioning.md`** — NEW. Codifies:
  - **ID stability rule**: a taxonomy ID, once added to a published `v{N}`, MAY NEVER be removed, renamed, or have its `repairArchetype` semantically changed inside that version. Such changes require a new `v{N+1}` registry file.
  - **Alias channel**: when a future version renames `lcp.preload-missing` → `lcp.resource-hint-missing`, `v1.ts` keeps the original; `v2.ts` defines the new ID + declares `aliases: ['lcp.preload-missing']`. Readers across versions resolve via alias.
  - **Distinctness test**: two taxonomy IDs MAY NOT share the same `(metric, repairArchetype)` tuple — that's the operational check for "is this archetype distinct."
  - **Version-bump triggers**: (a) deletion, (b) rename, (c) semantic redefinition of `repairArchetype`. NOT triggers: (a) adding new IDs, (b) widening `docUrl`, (c) clarifying `severity`.
  - **Reader contract**: Any tool reading `Report.diagnoses` MUST also read `Report.taxonomyVersion` and fail closed if it doesn't recognize the version (rather than silently misinterpreting).
  - **Schema-validation contract**: every published Report MUST validate against the JSON Schema bundled at `packages/core/src/schema/report.schema.json` (regenerated from `types.ts` via `npm run gen:schema`). CI fails if the generated schema diff is uncommitted.

### Modified

- **`packages/core/src/engine.ts`** — at report-finalize boundary, spread the new optional fields into the Report:
  ```ts
  ...(diagnoses.length ? { diagnoses } : {}),
  ...(absences.length ? { absences } : {}),
  ...(taxonomyVersionUsed ? { taxonomyVersion: taxonomyVersionUsed } : {}),
  ```
  No structural change to engine flow — just additive serialization.
- **`packages/reporter-json/src/index.ts`**, **`packages/reporter-markdown/src/index.ts`** — when `diagnoses` is present, render diagnoses (machine-readable in JSON, structured headers + repairArchetype + docUrl in markdown) ABOVE the existing audits block. Audits block becomes a collapsed "All audits" section in markdown.
- **`packages/viewer/src/render.ts`** (CLI HTML reporter) — mirror: render diagnoses section + absences section above audits. Bundle-budget impact assessed in tasks.md §B5.
- **`apps/website/components/viewer/report-viewer.tsx`** — read `report.diagnoses` and `report.absences` if present; render new `<DiagnosesPanel>` and `<AbsencesPanel>` components. Falls back gracefully to existing audit UI when missing (e.g., reports from change-#1-era).
- **`apps/website/components/insights/diagnoses-panel.tsx`** — NEW. Lists `Diagnosis[]` grouped by `metric`, each item linkable to `docUrl`, each subject's `sourceLocation` rendered as a clickable `file:line:col` (opens a deep-link to GitHub if `repoRoot` config provides a remote).
- **`apps/website/components/insights/absences-panel.tsx`** — NEW. Lists `AbsenceFinding[]`, each rendered as an alert card with `expected` text and `expectedLocation` rendered as a target location to edit.

### Out of scope (deferred — see "MVA cuts")

- Source-map resolution for **LCP attribution URL** and **INP longest-script URL** — only **LongTask** sourceLocation in v1 (highest-yield path; LCP/INP are nice-to-have).
- Code-window inline embedding — code windows are written to side artifacts (`ArtifactRef`) by default; viewer fetches lazily. **Inline embedding is deferred to v2.1.**
- TMS-injected multi-hop chain reconstruction — capture only the **immediate parent** for v1 (one level of `injectionPath`, length ≤ 1 for most paths). Multi-hop chains deferred to v2.1.
- More than 12 taxonomy IDs — start with the 12 with clean 1:1 audit/absence mapping. Adding IDs in v1 minor releases is non-breaking; v2 reserved for breaking changes.
- HTML-source mapping for static `<script src=...>` tags — needs HTML parser + source positions, low yield; deferred to v2.1.
- Service-worker / web-worker injection attribution — postMessage'd injection is rare and out of scope; degraded to `Resource.injectionPath: undefined`.
- Code-window display in SPA viewer — diagnoses-panel renders `file:line:col` only; clicking opens external editor / GitHub deep-link.

## Pinned design decisions (Phase 2 synthesis)

- **Taxonomy structure**: frozen `Object.freeze({...} as const satisfies ...)` registry, NOT a TS `enum`. Reason: enums carry no payload, can't `satisfies`-validate, and the registry's `{metric, severity, repairArchetype, docUrl}` payload is the value for both runtime and LLM consumers.
- **`@ohmyperf/sourcemaps` is a new workspace package, not part of `@ohmyperf/core`**. Reason: pulls `node:fs`/`node:crypto` and we must keep `core` browser-safe for the extension + viewer bundles.
- **Source-map library**: `@jridgewell/trace-mapping`, not Mozilla `source-map` (WASM, deprecated) or `@jridgewell/source-map` (wrapper). Trace-mapping is the lowest-level primitive — sync API, zero deps, ~20KB.
- **Source maps resolved at `onReport`, never at collection time.** Source-map disk I/O is bounded (per-map timeout 500ms, total finalize budget 3s, concurrency cap 4). Budget exhaustion → `degradation: { capability: 'source-maps', reason: 'finalize-budget-exceeded' }`, NOT a crash.
- **Injection-shim CSP fallback path is mandatory.** The `Page.addScriptToEvaluateOnNewDocument` route bypasses `script-src` since it injects at isolated world. If even *that* is blocked (rare — fenced frames, certain extension contexts), emit `degradation: { capability: 'injection-attribution', reason }` and proceed. The shim **must never** crash the page.
- **DOM snapshot taken once at `onIdle`, absences computed at `onReport`.** Absences are *structural inferences over a frozen snapshot* — never re-query the DOM during absences. Deterministic by construction.
- **Code window: side-artifact by default, not inline.** `SourceLocation` carries `codeWindowRef?: ArtifactRef` (sha256+size). Inline embedding would blow the JSON budget for any non-trivial report. Viewer can lazily fetch the artifact when expanding a diagnosis.
- **Diagnoses and audits coexist permanently in v1.x.** Diagnoses are the preferred machine-readable surface; audits remain the human-readable freeform surface. **No deprecation path inside this change.** A v2 schema bump could optionally remove `audits`, but that decision is deferred.
- **Diagnoser is in `@ohmyperf/plugins-builtin`, not core.** The taxonomy registry lives in core (leaf, browser-safe), but the *application* of the registry (mapping audits → diagnoses + running absence checks) belongs in the plugin layer. This keeps `core` engine-only and keeps the LLM-native surface in user-extensible territory.
- **Path-traversal hardening**: `@ohmyperf/sourcemaps` refuses any resolved `.map` path outside `config.repoRoot`. Absolute paths outside root → reject. `../` escapes → reject. Symlinks resolved before the boundary check.
- **Privacy**: code-window artifacts contain raw source. The share-server's existing redaction pipeline (ADR-005) MUST be extended to redact `codeWindow` artifacts by default; opt-in flag `--include-source` required to ship code windows in shared reports.
- **Bundle budget guard**: when the diagnoser plugin is enabled in the SPA build, the new `<DiagnosesPanel>` + `<AbsencesPanel>` components must NOT push the viewer bundle over **200KB gz** (measured pre-CDN via the existing `bundlesize` config, gzip with `level: 9`). Sub-budgets — `<DiagnosesPanel>` ≤ 6KB gz, `<AbsencesPanel>` ≤ 4KB gz, panel-shared utilities ≤ 2KB gz — measured by dynamic-import-isolating each panel via `React.lazy(() => import('./diagnoses-panel'))` so the main-chunk first-paint budget is not crowded.
- **CDP primitive note** (B3): Existing collectors use `Page.addScriptToEvaluateOnNewDocument` for install + polling via `Runtime.evaluate` for readback. This change **does not introduce** `Runtime.addBinding` / `Runtime.bindingCalled` (which would be net-new CDP surface area requiring an OOPIF binding-propagation story). The injection collector follows the existing polling pattern. A future ADR may consolidate all collectors onto `addBinding` as a uniform upgrade.
- **`SourceLocation` lifecycle** (raw vs resolved): `SourceLocation.file` carries two distinct shapes across the pipeline. **Pre-resolution** (emitted by `injection-collector` at `finalize()`): `file` holds the minified URL (e.g., `https://cdn.foo.com/app.js`) and `line/column` are positions in that minified file. **Post-resolution** (rewritten by `sourceMapResolverPlugin` at `onReport`): `file` is a path relative to `repoRoot` (e.g., `app/page.tsx`). A new `SourceLocation.resolved: boolean` field (additive optional, defaults `false`) marks the lifecycle phase. Readers MUST check `resolved` before treating `file` as a source-tree path. This avoids carving out a separate `RawSourceLocation` type.
- **`Report.warnings` / `Report.degradations` are top-level, additive, and `ReadonlyArray`.** Plugins emit by **returning a new Report** from their `onReport` hook with arrays extended; `.push` is forbidden because `Report` is deep-readonly. `Report.degradations[*].capability` uses a NEW union `PluginDegradationCapability = 'source-maps' | 'injection-attribution' | 'absences' | 'diagnoser'` — kept distinct from the closed `DriverCapability` union which `ReportMeta.degradations` already uses (no widening).
- **Bundle budget guard**: when the diagnoser plugin is enabled in the SPA build, the new `<DiagnosesPanel>` + `<AbsencesPanel>` components must NOT push the viewer bundle over **200KB gz**. Measured in CI via existing `bundlesize` step. (Note: previous Pinned bullet retained for completeness; specifics in budget-guard above.)
- **Git identity**: every commit on this branch uses `nhoxtvt@gmail.com` per the global `.gitconfig-personal` `includeIf` rule. No local user overrides.

## MVA cuts (what does NOT ship in v1 of this change)

1. **18 taxonomy IDs deferred.** Ship 12 in v1 with clean 1:1 audit/absence mapping. Adding more in v1.x patches is non-breaking.
2. **B2 covers LongTask only**, not LCP/INP attribution. LCP/INP source maps follow in v2.1.
3. **Code windows are artifact-only.** Inline embedding is v2.1.
4. **Single-hop injection chain.** Multi-hop TMS reconstruction is v2.1.
5. **No SPA UI for code-window display.** `file:line:col` text only with external link.

## Success criteria

1. **Taxonomy stability**: run the diagnoser plugin twice on the same fixture page, byte-compare `report.diagnoses` and `report.absences` arrays — MUST be byte-equal across runs (modulo timing-derived `estimatedImpactMs` which is excluded from the equality check via a deterministic-comparison helper).
2. **Source-map ground truth**: a fixture bundle `tests/fixtures/sourcemap-fixture/dist/bundle.js` (built from `src/Foo.tsx`) with adjacent `bundle.js.map`; a synthetic LongTask attributed to that URL+line. After resolution, `longTasks[0].sourceLocation.file` MUST equal `src/Foo.tsx`, `function` MUST equal the original function name, `sourceMapHash` MUST equal the sha256 of `bundle.js.map`.
3. **Injection attribution**: a fixture Next.js page that does `useEffect(() => { const s = document.createElement('script'); s.src = '/intercom.js'; document.head.appendChild(s); })` from `app/page.tsx:NN`. After measurement, the `Resource` for `/intercom.js` MUST have `injectionPath[0].file === 'app/page.tsx'` and `injectionPath[0].line === NN`.
4. **Negative-space audit**: a fixture page with `<img src="/hero.jpg">` as LCP (no preload, no width/height). The Report MUST contain BOTH `absences[].id === 'lcp.preload-missing'` (subject matching `/hero.jpg`) AND `absences[].id === 'cls.image-dimensions-missing'` (subject matching the `<img>` selector). Re-running 10× MUST produce byte-equal absences arrays.
5. **Bundle budgets**: `viewer` bundle ≤ 200KB gz and `deck` bundle ≤ 500KB gz after this change merges. CI gate.
6. **Backward compatibility**: a Report produced before this change (no `diagnoses`, no `absences`, no `taxonomyVersion`) MUST still render in the SPA viewer without crash or visible-error.
7. **JSON Schema**: the regenerated `packages/core/src/schema/report.schema.json` MUST validate every fixture report in `tests/fixtures/reports/*.json`. CI gate.

## Risks

- **Source-map disk I/O latency** dominates finalize time. Mitigation: hard 3s budget, concurrency cap 4, per-map 500ms timeout, `degradation` field on overflow rather than block-and-wait.
- **Injection-shim CSP/fenced-frame edge cases.** Mitigation: `degradation` capability fallback; never crash the page. Shim hardened against re-entrancy via WeakSet guard.
- **Taxonomy curation risk** (who decides "is this archetype distinct?"). Mitigation: ADR-006 distinctness test (no two IDs share `(metric, repairArchetype)`); curation handled in PR review by codeowners on `taxonomy/v1.ts`.
- **JSON bloat** from sourceLocation per LongTask × per Report. Mitigation: artifact-by-default code windows; sourceLocation inline fields are small (≤120 bytes typical).
- **Path traversal via crafted sourceMappingURL.** Mitigation: refuse any resolved path outside `repoRoot`; symlinks resolved first; no `../` escape.
- **Determinism rot.** Mitigation: `tests/determinism/absences.test.ts` runs each absence fixture 10× and asserts byte-equal; this is a CI gate, not a test we tolerate flaking.
- **Browser stack-trace format variance** (V8 vs SpiderMonkey vs WebKit). Mitigation: ohmyperf only targets V8 (CDP) — fixed stack format. Documented in ADR-006.
- **Cross-origin source maps.** Mitigation: same-origin or `repoRoot`-discoverable only; refuse to fetch over network.
- **Future Performance Insights v2 conflict** (Lighthouse 13's `@paulirish/trace_engine` insights overlap with our taxonomy). Mitigation: keep `taxonomy/v1.ts` insights-engine-agnostic; if/when we adopt trace_engine insights later, *map* their IDs into our taxonomy, never adopt theirs as canonical.
