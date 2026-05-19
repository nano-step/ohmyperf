# Tasks: LLM-Native Taxonomy + Source Maps (Change #2 of 5)

Phasing rationale: **B1 (taxonomy) is foundational** — B4 absences reference taxonomy IDs and the diagnoser mapping table needs IDs to exist. **B2 (source maps) is prerequisite for B3** — injection-attribution `injectionPath` entries are raw stacks until source-maps resolves them. **B5 (governance + schema) lands alongside B1** so the rules are codified before anyone is tempted to break them. **B6 (SPA UI + bundle-budget gate) is last** so the wire format is frozen before the viewer is wired up.

## B1. Failure-mode taxonomy (foundational)

- [ ] B1.1 Create `packages/core/src/taxonomy/types.ts` with `TaxonomyEntry`, `TaxonomyId`, `Severity` (`'high' | 'medium' | 'low'`), `Metric` (`'lcp' | 'inp' | 'cls' | 'tbt' | 'fcp' | 'fonts' | 'cache' | 'compression'`).
- [ ] B1.2 Create `packages/core/src/taxonomy/v1.ts` with the v1 frozen registry. The twelve archetypes (MVA cut):
  - `lcp.preload-missing` — high — repair `add-link-preload` — doc `https://web.dev/articles/preload-critical-assets`
  - `lcp.render-blocking-script` — high — repair `defer-or-move-script` — doc `https://web.dev/articles/render-blocking-resources`
  - `lcp.image-too-large` — medium — repair `compress-or-srcset` — doc `https://web.dev/articles/uses-optimized-images`
  - `lcp.lcp-image-not-discoverable` — high — repair `inline-lcp-img-or-preload` — doc `https://web.dev/articles/optimize-lcp`
  - `inp.handler-too-long` — high — repair `yield-or-debounce-handler` — doc `https://web.dev/articles/optimize-inp`
  - `inp.long-input-delay` — medium — repair `reduce-blocking-before-interaction` — doc `https://web.dev/articles/inp`
  - `cls.image-no-dimensions` — high — repair `add-width-height-attrs` — doc `https://web.dev/articles/cls#how_to_improve_cls`
  - `cls.layout-shift-third-party` — medium — repair `reserve-space-for-third-party` — doc `https://web.dev/articles/cls`
  - `tbt.script-evaluation` — high — repair `defer-or-split-script` — doc `https://web.dev/articles/tbt`
  - `font.display-swap-missing` — medium — repair `add-font-display-swap` — doc `https://web.dev/articles/font-display`
  - `cache.static-asset-no-cache-control` — medium — repair `add-cache-control-immutable` — doc `https://web.dev/articles/uses-long-cache-ttl`
  - `compression.large-text-uncompressed` — medium — repair `enable-text-compression` — doc `https://web.dev/articles/uses-text-compression`
  Wrap in `Object.freeze({...} as const satisfies Record<string, TaxonomyEntry>)`. Export `type TaxonomyId = keyof typeof TAXONOMY_V1`.
- [ ] B1.3 Create `packages/core/src/taxonomy/index.ts` barrel: re-export `TAXONOMY_V1`, types, and helper `getTaxonomyEntry(id: TaxonomyId): TaxonomyEntry` + `isTaxonomyId(s: string): s is TaxonomyId`.
- [ ] B1.4 Distinctness lint: add `tests/unit/taxonomy/distinctness.test.ts` that fails if any two entries share the same `(metric, repairArchetype)` tuple. (Per ADR-006.)
- [ ] B1.5 Stability lint: add `tests/unit/taxonomy/stability.test.ts` that snapshots the array of v1 IDs; failing the snapshot is a deliberate trip-wire that requires editing the snapshot file (forcing reviewer attention).
- [ ] B1.6 Schema regeneration: create `scripts/gen-schema.ts` using **`ts-json-schema-generator@^1.5.0`** (pinned exact version; deterministic flag set: `--sort-props --no-additional-properties`). Include `Diagnosis`, `AbsenceFinding`, `SourceLocation`, `TaxonomyId` (string union of v1 IDs), `Report.warnings`, `Report.degradations`, `RunReport.pluginData`. Output `packages/core/src/schema/report.schema.json`. Add `pnpm gen:schema` npm script. CI gate: `pnpm gen:schema && git diff --quiet packages/core/src/schema/` must pass (commit must include regenerated schema).
- [ ] B1.7 Type additions in `packages/core/src/types.ts` (additive only, schema stays at `"1.0.0"`):
  - `SourceLocation` interface (file, line, column, function?, sourceMapHash?, codeWindowRef?, **resolved?: boolean**). The `resolved` field marks the lifecycle phase: `false` (or absent) = `file` holds a minified URL; `true` = `file` is `repoRoot`-relative source-tree path. Readers MUST check before treating `file` as a source path.
  - `Diagnosis` interface.
  - `DiagnosisSubject` interface.
  - `AbsenceFinding` interface.
  - `PluginDegradationCapability` string union: `'source-maps' | 'injection-attribution' | 'absences' | 'diagnoser'`. Kept distinct from existing closed `DriverCapability`.
  - Optional sibling fields: `MetricAttribution.sourceLocation?`, `LongTask.sourceLocation?`, `Resource.injectionPath?`.
  - **Top-level on `Report`**: `diagnoses?`, `absences?`, `taxonomyVersion?`, `warnings?: ReadonlyArray<{ id: string; count?: number; detail?: string }>`, `degradations?: ReadonlyArray<{ capability: PluginDegradationCapability; reason: string }>`.
  - **Top-level on `RunReport`**: `pluginData?: Readonly<Record<string, unknown>>` — used by `dom-snapshot.ts` collector to store the snapshot per-run.
  - **On `Report.artifacts`**: `codeWindowRefs?: ReadonlyArray<ArtifactRef>` (additive optional) — emitted by `@ohmyperf/sourcemaps` when `codeWindow === 'artifact'`.
  - Verify NO existing field is widened/narrowed/removed (run `tsc --noEmit` against fixtures from `tests/fixtures/reports/`). Existing `ReportMeta.degradations` is untouched — `DriverCapability` is NOT widened.

## B2. Source-map resolution (`@ohmyperf/sourcemaps`)

- [ ] B2.1 Create new workspace package `packages/sourcemaps/` (name `@ohmyperf/sourcemaps`). `package.json` with `"engines": { "node": ">=20" }`. Add `@jridgewell/trace-mapping` as runtime dep. Add to `pnpm-workspace.yaml`.
- [ ] B2.2 Implement `packages/sourcemaps/src/resolver.ts`:
  - `class SourceMapResolver(config: SourceMapConfig)`.
  - `async resolve(url: string, line: number, column: number): Promise<SourceLocation | null>`.
  - Map discovery: in-memory script bytes (preferred, via the Network domain's `getResponseBody` cached payload) → check trailing `//# sourceMappingURL=...` comment → resolve relative to script URL. Fallback: look for `<scriptpath>.map` on disk under `config.repoRoot`.
  - Path-traversal guard: `path.resolve(repoRoot, mapPath)` must `startsWith(path.resolve(repoRoot) + path.sep)`; reject otherwise.
  - Cache by `sourceMapHash` (sha256 of raw map bytes) — repeated lookups for same map reuse the parsed `TraceMap`.
  - On read/parse error: return `null`, log warning to passed-in logger.
- [ ] B2.3 Implement `packages/sourcemaps/src/plugin.ts`:
  - Export `sourceMapResolverPlugin(config: SourceMapConfig): OhMyPerfPlugin`.
  - Hook `onReport(report, ctx)`:
    - Walk all `report.runs[*].longTasks[*]` with an `attribution.url + line + column` (or the change-#1 `attributionRich.url`) — resolve, attach `sourceLocation`.
    - (Out of scope for v1) Walk `MetricAttribution` of LCP and INP — deferred to v2.1 (see proposal MVA cuts).
    - Walk `report.runs[*].resources[*].injectionPath?[*]` — each entry contains a raw `{ url, line, column }` from the shim; resolve to source-tree `SourceLocation`. Leave as raw if unresolvable (caller can still see the minified URL).
  - Concurrency: bounded by 4 simultaneous resolutions via in-package 10-line semaphore (no new dep).
  - Budget enforcement: total wall-clock budget 3s for the whole `onReport` pass; if exceeded, finalize remaining items as-is and emit `report.warnings.push({ id: 'source-maps.finalize-budget-exceeded', count: remaining })`.
  - Per-map timeout: 500ms `fs.readFile` race.
- [ ] B2.4 Code-window artifact emission: when `config.codeWindow === 'artifact'` (default), after a successful resolve, read ±15 lines of the original-source file (`config.repoRoot/<file>`); compute sha256; write to `ctx.artifacts.put(...)` with `{ kind: 'codeWindow', sha256, bytes }`; set `sourceLocation.codeWindowRef = { sha256, bytes }`. When `codeWindow === 'none'`, skip. (`'inline'` is reserved for v2.1 — current change rejects with a config-validation error if set.)
- [ ] B2.5 Register `sourceMapResolverPlugin` into the default plugin list **only for** `apps/cli/src/commands/run.ts`, `apps/runner/src/runner.ts`, and `apps/mcp-server/src/server.ts`. The extension surface (`apps/extension-chrome/src/background.ts`) emits `degradation: { capability: 'source-maps', reason: 'extension-fs-unavailable' }` and does NOT register the plugin.
- [ ] B2.6 Config plumbing: `MeasureOptions.sourceMaps?: SourceMapConfig` threaded through CLI flag `--source-maps auto|disabled`, runner request body, MCP `measure` tool. Default `'auto'` in CLI/runner/MCP; `'disabled'` in extension.
- [ ] B2.7 Test fixture (happy path): `tests/fixtures/sourcemap-fixture/` contains `src/Foo.tsx` (TS), built `dist/bundle.js` + `dist/bundle.js.map` (committed; tiny, well-known mapping). Test `tests/unit/sourcemaps/resolve.test.ts` asserts: `resolve('dist/bundle.js', knownLine, knownCol)` returns `{ file: 'src/Foo.tsx', line: M, column: N, function: 'Foo', sourceMapHash: <known-sha>, resolved: true }`.
- [ ] B2.7a Variant fixture (Vite virtual): `tests/fixtures/sourcemap-vite-fixture/` with a `sourceMappingURL` referencing `/@id/__x00__virtual:foo`. Test asserts resolver returns a synthetic `SourceLocation` with `file: '<virtual:...>'`, `codeWindowRef: undefined`, NOT an error.
- [ ] B2.7b Variant fixture (esbuild inline base64 map): `tests/fixtures/sourcemap-esbuild-fixture/` with `//# sourceMappingURL=data:application/json;base64,...`. Test asserts inline data-URL decode + resolve produces correct `SourceLocation` with `sourceMapHash` derived from the decoded bytes.
- [ ] B2.7c Variant fixture (webpack v3 index map): `tests/fixtures/sourcemap-webpack-index-fixture/` containing a sections-based index map. Test asserts `@jridgewell/trace-mapping` correctly resolves sectioned mappings.
- [ ] B2.7d Variant fixture (eval'd code): `tests/fixtures/sourcemap-eval-fixture/` whose LongTask comes from a `<script>eval('function foo(){...}')</script>`. Test asserts `sourceLocation` is undefined AND `report.warnings[]` contains `source-maps.unresolvable-inline`.
- [ ] B2.7e Variant fixture (`data:` URL script): `tests/fixtures/sourcemap-dataurl-fixture/` whose LongTask comes from a `data:application/javascript;base64,...` script. Test asserts `sourceLocation` is undefined AND `report.warnings[]` contains `source-maps.unresolvable-data-url`.
- [ ] B2.8 Hardening test (POSIX): `tests/unit/sourcemaps/path-traversal.test.ts` — craft a `sourceMappingURL` of `../../../etc/passwd`; resolver returns `null` and logs warning, does NOT read the file.
- [ ] B2.8a Hardening test (Windows path semantics): `tests/unit/sourcemaps/path-traversal-windows.test.ts` (gated on `process.platform === 'win32'` in CI matrix) — cases: (a) `repoRoot=C:\\repo` + `sourceMappingURL=/c:/repo/../etc/passwd` → reject. (b) UNC path `\\?\C:\repo\bundle.js.map` outside `repoRoot` → reject. (c) Forward-slash mixing `C:/repo/dist/bundle.js.map` resolved against `C:\\repo` → accept (normalized). (d) Symlink at `<repoRoot>/dist/bundle.js.map` pointing to `/etc/passwd` → resolve symlink first, then reject because target is outside `repoRoot`. (e) Case-insensitive drive-letter compare on Win32: `c:\\repo` matches `C:\\repo`. Add `windows-latest` to the existing CI matrix for this test file specifically.
- [ ] B2.9 Budget test: `tests/unit/sourcemaps/budget.test.ts` — synthetic resolver with 100 maps each delaying 50ms; assert total wall-clock ≤ 3.5s and `report.warnings[]` contains `source-maps.finalize-budget-exceeded`.

## B3. Injection attribution (requires B2)

- [ ] B3.1 Author `packages/core/src/collectors-impl/injection-shim.ts` (TS source form). **Emit happens ONLY on DOM insertion, never on creation or `src` setter.** Patch points (in this exact order):
  - `Document.prototype.createElement` — when invoked with `'script'`, mark the returned element with non-enumerable `__omp_created_stack = new Error().stack`. **No emit at this step.**
  - `HTMLScriptElement.prototype` setter for `src` — when set, **refresh** `__omp_created_stack = new Error().stack` (overwrite). This handles the case where `<script>` is created via `createElement('script')` and the `src` is set significantly later. **No emit at this step.**
  - `Node.prototype.appendChild` / `insertBefore` / `replaceChild` — on insertion of an element with `nodeName === 'SCRIPT'`, **emit** a record `{ kind: 'omp.inj', src: el.src, stack: el.__omp_created_stack ?? new Error().stack }` by pushing onto `window.__ohmyperf_injections` (array initialized at shim load).
  - Re-entrancy guard: WeakSet `__omp_emitted` of script elements already emitted; check-and-set before pushing. Prevents double-emit when frameworks detach/reattach the same `<script>` node.
  - **No memory leak risk**: `__omp_created_stack` is attached to the element itself, GC'd with it. WeakSet does not retain elements.
- [ ] B3.2 Build pipeline: `scripts/build-inline-scripts.ts` (existing) extended to additionally produce `packages/core/src/collectors-impl/__build/injection-shim.string.ts` exporting `INJECTION_SHIM_SRC: string`. Build runs in `prebuild` lifecycle script.
- [ ] B3.3 Implement `packages/core/src/collectors-impl/injection-collector.ts` (**polling-readback pattern, mirroring `cwv-collector.ts` and `longtask-collector.ts`**; does NOT introduce `Runtime.addBinding`):
  - On `create(session, ctx)`: `await session.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECTION_SHIM_SRC, runImmediately: true })`. (Same install pattern as `cwv-collector.ts`.)
  - On `finalize()`:
    - Read accumulated records via `await session.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__ohmyperf_injections || [])', returnByValue: true })`.
    - Parse each record's `stack` into raw `SourceLocation[]` (top frame first) using V8 stack-format regex (`at <fn> (<url>:<line>:<col>)`). **Each entry has `resolved: false`** and `file` = the minified URL.
    - For each `Resource` in the report whose URL matches a captured record's `src`, attach `resource.injectionPath = locations[0..N]` (immediate inserter first; only depth-1 in v1 per MVA cut).
    - `@ohmyperf/sourcemaps` later rewrites entries to `resolved: true` form during its `onReport` hook.
- [ ] B3.4 CSP fallback: wrap `Page.addScriptToEvaluateOnNewDocument` in try/catch; on error, return a new `Report` from `finalize()` with `degradations` extended by `{ capability: 'injection-attribution', reason: <err.message> }` and skip the collector — DO NOT throw, DO NOT mutate (Report is deep-readonly; use returned-new-Report pattern via the engine's `report-spread` boundary).
- [ ] B3.5 OOPIF coverage: confirm the existing `Target.setAutoAttach` flow (in `cwv-collector.ts`) bubbles `Page.addScriptToEvaluateOnNewDocument` into child frames. If not, add per-frame init-script registration in the auto-attach handler. Per-frame `window.__ohmyperf_injections` arrays are read and merged at finalize.
- [ ] B3.6 Static `<script src=...>` mapping: explicitly **out of scope for v1** (see MVA cuts). For static tags, `resource.injectionPath` is `undefined`. Tasks for v2.1 (HTML-source mapping) documented in a follow-up issue but not blocking.
- [ ] B3.7 Test fixture: `tests/fixtures/injection-fixture/` is a tiny Next.js page that `useEffect(() => { const s = document.createElement('script'); s.src = '/static/intercom.stub.js'; document.head.appendChild(s); }, [])` from `app/page.tsx` at a known line. Build with source maps. Run a measurement against the fixture (via the playwright driver in test mode). Assert `report.runs[0].resources.find(r => r.url.endsWith('intercom.stub.js')).injectionPath[0]` resolves to `{ file: 'app/page.tsx', line: <known>, column: <known> }`.
- [ ] B3.8 CSP fixture test: serve a fixture with `Content-Security-Policy: script-src 'self' 'unsafe-inline'` and a strict-dynamic variant; assert (a) injection collector still works (CDP init-script bypass), (b) on artificial failure the collector emits the degradation field.

## B4. Negative-space audits (depends on B1; depends on dom-snapshot collector)

- [ ] B4.1 Implement `packages/core/src/collectors-impl/dom-snapshot.ts`:
  - On `onIdle()` (fires **per run** — see B4.1a for multi-run rule), execute a single page-script via `Runtime.evaluate` that walks the DOM and returns a structured snapshot:
    - `images: Array<{ selector, src, hasWidth, hasHeight, hasLoadingLazy, isLcp }>` (selector built via deterministic structural-path algorithm — tag + nth-child chain, no IDs or classes; isLcp inferred via the LCP attribution's element-selector if present).
    - `links: Array<{ selector, rel, href, as, crossorigin }>`.
    - `scripts: Array<{ selector, src?, isInline, hasAsync, hasDefer, isModule }>` (only `<script>` tags reachable from `document.querySelectorAll`).
    - `styles: Array<{ selector, isInline, inlineBytes }>`.
  - Store on `report.runs[i].pluginData['ohmyperf:domSnapshot']` (use the canonical namespace key). Requires `RunReport.pluginData?` field addition per B1.7. Each run gets its own snapshot.
  - Determinism contract: snapshot is read once per run, never updated, never re-queried during absences.
- [ ] B4.1a Multi-run determinism rule: **Absence checks operate against `report.runs[0].pluginData['ohmyperf:domSnapshot']` only — the first run** (cold-cache run is run-0 by ohmyperf convention). Subsequent runs' snapshots are emitted into the Report for debugging but are NOT inputs to absences. Document this in `diagnoser.ts` JSDoc and add a multi-run determinism scenario in `negative-space-audits/spec.md` that runs the fixture with `runs: 3` and asserts byte-equal absences regardless of run-1/run-2 DOM drift.
- [ ] B4.2 Author `packages/plugins-builtin/src/absences/lcp-preload-missing.ts`:
  - Pure fn: `(snapshot, resources, lcpAttribution) => AbsenceFinding | null`.
  - Logic: if `lcpAttribution.url` is an image URL AND `snapshot.links.find(l => l.rel === 'preload' && l.href === lcpAttribution.url) === undefined`, emit `{ id: 'lcp.preload-missing', subject: { url: lcpAttribution.url, selector: <lcp element selector>, count: 1 }, expected: '<link rel="preload" as="image" href="' + url + '">', expectedLocation: { kind: 'response-header', ... } | <HTML doc head>, estimatedImpact: { metric: 'lcp', deltaMs: <delta from waterfall> } }`.
- [ ] B4.3 Author `packages/plugins-builtin/src/absences/image-dimensions-missing.ts`:
  - For each `snapshot.images[]` where `!hasWidth || !hasHeight` AND the image contributed to a layout shift in `report.runs[0].layoutShifts` (matched by selector), emit one finding. Aggregate multiple images into a single `AbsenceFinding` with `subject.count = N` and `subject.selector = <list-shortened>` — keep deterministic order (sorted by selector).
- [ ] B4.4 Author `packages/plugins-builtin/src/absences/font-display-swap-missing.ts`:
  - For each `resources[]` with `mimeType.startsWith('font/')` AND the matching `@font-face` rule in any inline stylesheet does NOT declare `font-display: swap | optional`, emit finding. (Parse `@font-face` from inline styles via a regex — full CSS parser is over-engineering for v1.)
- [ ] B4.5 Author `packages/plugins-builtin/src/absences/cache-control-static-assets.ts`:
  - For each `resource` where `resourceType in {'script','stylesheet','image','font'}` AND response `cache-control` header is missing OR contains `no-cache | no-store | max-age=0`, emit finding (one per resource; sorted by URL).
- [ ] B4.6 Author `packages/plugins-builtin/src/absences/large-text-uncompressed.ts`:
  - For each `resource` where (`mimeType` is text-ish OR JSON OR JS OR CSS) AND `transferSize >= 10KB` AND response `content-encoding` is missing or `identity`, emit finding.
- [ ] B4.7 Compose `packages/plugins-builtin/src/diagnoser.ts`:
  - Plugin shape: `{ id: 'ohmyperf-diagnoser', onReport(report, ctx) }`.
  - Pass 1: audits → diagnoses via `diagnoser-mapping.ts` table.
  - Pass 2: run the five absence checks in fixed order; concatenate findings; sort entire `absences[]` by `(id, subject.url ?? subject.selector ?? '')`.
  - Set `report.diagnoses` and `report.absences`. Set `report.taxonomyVersion = 'v1'`.
- [ ] B4.8 Author `packages/plugins-builtin/src/diagnoser-mapping.ts`:
  - Frozen `Record<string /* audit id */, TaxonomyId>`. v1 mapping table (sparse — only audits that have a clean 1:1 archetype mapping; other audits remain free-form in `audits[]` and are not phantom-promoted to diagnoses):
    - `'render-blocking-resources' → 'lcp.render-blocking-script'`
    - `'unsized-images' → 'cls.image-no-dimensions'`
    - `'uses-text-compression' → 'compression.large-text-uncompressed'`
    - `'uses-long-cache-ttl' → 'cache.static-asset-no-cache-control'`
    - `'uses-optimized-images' → 'lcp.image-too-large'`
    - `'font-display' → 'font.display-swap-missing'`
    - `'long-tasks' → 'tbt.script-evaluation'` (when long-task audit fires)
    - `'large-image-no-srcset' → 'lcp.image-too-large'`
  - **Sparseness is intentional and non-version-bumping**: per ADR-006, adding new mappings to this table in v1.x patches is non-breaking. The table is the "what audits the v1 diagnoser CAN currently lift" surface; it grows incrementally as audit emitters land. Audits with no mapping remain in `audits[]` and do not appear in `diagnoses[]` — see `llm-native-taxonomy/spec.md` Requirement: "Unmapped audit IDs do not generate phantom diagnoses."
- [ ] B4.9 Determinism test: `tests/determinism/absences.test.ts` runs `diagnoser` 10 times against `tests/fixtures/absences-fixture/` and asserts byte-equal `report.absences` JSON each iteration.
- [ ] B4.10 False-positive guard: fixture page WITH a `<link rel="preload" as="image" href="...">` for the LCP image MUST NOT trigger `lcp.preload-missing`. Add test `tests/unit/absences/preload-present-no-finding.test.ts`.

## B5. Governance (ADR-006) + schema validation

- [ ] B5.1 Author `openspec/adrs/ADR-006-taxonomy-stability-and-versioning.md` per proposal's ADR section (stability rule, alias channel, distinctness test, version-bump triggers, reader contract, schema-validation contract).
- [ ] B5.2 Wire schema regen check into CI: a `pnpm gen:schema` step that fails the build if `git diff --quiet packages/core/src/schema/` returns nonzero. (i.e., the committed schema must match what gen produces — prevents drift.)
- [ ] B5.3 JSON-schema fixture validation: `tests/schema/all-fixtures-validate.test.ts` runs `ajv` over every JSON in `tests/fixtures/reports/` against `report.schema.json`. Failing = either a fixture is malformed or the schema doesn't model reality.
- [ ] B5.4 Add `Report.warnings` and `Report.degradations` to types as additive optional **top-level** fields (already specified in B1.7 — this task is the canonical verification gate). Confirm by reading `packages/core/src/types.ts` that:
  - `Report.warnings?: ReadonlyArray<{ id: string; count?: number; detail?: string }>` exists.
  - `Report.degradations?: ReadonlyArray<{ capability: PluginDegradationCapability; reason: string }>` exists.
  - `PluginDegradationCapability` union is defined and exported.
  - **`ReportMeta.degradations` is UNTOUCHED** — `DriverCapability` is NOT widened to include `'source-maps'`/`'injection-attribution'`. (Driver vs plugin degradation capabilities are kept distinct unions.)
- [ ] B5.5 Extend `ReportCtx` for plugin artifact emission. Current `ReportCtx` is `{ logger }`; @ohmyperf/sourcemaps needs to write code-window bytes that end up on `Report.artifacts.codeWindowRefs`. Add (additive only) to `ReportCtx`:
  - `artifacts: { put(kind: 'codeWindow' | 'sourceMap', bytes: Uint8Array): Promise<ArtifactRef> }` — returns an `ArtifactRef { sha256, bytes }` and stages it for the engine to attach to `Report.artifacts.codeWindowRefs` (or `sourceMapRefs`) at finalize. Implementation lives in `engine.ts` post-onReport-spread; the engine collates plugin-emitted artifacts and writes the array on the next Report iteration.
  - Update `Report.artifacts` to include `codeWindowRefs?: ReadonlyArray<ArtifactRef>`.
  - This is the **only** new public-API surface for plugins introduced by this change; document it in `packages/core/README.md`.

## B6. SPA viewer integration (last — wire format is frozen by now)

- [ ] B6.1 Implement `apps/website/components/insights/diagnoses-panel.tsx`. Read `report.diagnoses`; group by `metric`; render each as a card with severity badge, repair archetype, docUrl link, subjects list (each rendering `file:line:col` if `sourceLocation` present, else `selector` or `url`). Click on `file:line:col` opens a deep-link via configurable `repoRemote` (e.g., `https://github.com/<owner>/<repo>/blob/<sha>/<file>#L<line>`); no remote configured → plain text.
- [ ] B6.2 Implement `apps/website/components/insights/absences-panel.tsx`. Renders each `AbsenceFinding` as an alert card with: severity dot (from taxonomy lookup), expected (rendered in `<code>`), expectedLocation, estimated-impact callout.
- [ ] B6.3 Modify `apps/website/components/viewer/report-viewer.tsx`: when `report.diagnoses?.length || report.absences?.length`, render the two new panels above the existing audit blocks; otherwise fall back to current rendering (graceful for old reports).
- [ ] B6.4 Markdown reporter `packages/reporter-markdown/src/index.ts`: when present, render `## Diagnoses` and `## Absences` sections above `## Audits`. Diagnoses include the docUrl as a markdown link per item.
- [ ] B6.5 CLI HTML reporter `packages/viewer/src/render.ts`: mirror the SPA's diagnoses-panel + absences-panel in SSR HTML.
- [ ] B6.6 Bundle-budget CI gate: ensure `apps/website` viewer bundle ≤ 200KB gz, deck ≤ 500KB gz after merge. Use the existing `bundlesize` config. Sub-budgets: `<DiagnosesPanel>` ≤ 6KB gz, `<AbsencesPanel>` ≤ 4KB gz.
- [ ] B6.7 Backward-compat smoke test: load a pre-change-#2 report fixture (no `diagnoses`, no `absences`, no `taxonomyVersion`) into the SPA `/report/?id=<id>` route; assert no error overlay; assert existing `<Audits>` UI renders unchanged.

## B7. End-to-end ground-truth tests

- [ ] B7.1 `tests/e2e/taxonomy-stability.test.ts`: two back-to-back measurements of `tests/fixtures/absences-fixture/`; byte-equal `report.diagnoses` and `report.absences` (modulo `estimatedImpactMs` excluded via canonical deep-equal helper).
- [ ] B7.2 `tests/e2e/source-map-resolution.test.ts`: measurement of `tests/fixtures/sourcemap-fixture/` which deliberately triggers a LongTask in `src/Foo.tsx`. Assert resolved `sourceLocation.file === 'src/Foo.tsx'`, function name matches, `sourceMapHash` matches expected.
- [ ] B7.3 `tests/e2e/injection-attribution.test.ts`: measurement of `tests/fixtures/injection-fixture/` (Next.js page that injects `intercom.stub.js`). Assert `Resource.injectionPath[0]` resolves to `app/page.tsx:<line>:<col>`.
- [ ] B7.4 `tests/e2e/absence-detection.test.ts`: measurement of a fixture page with `<img src="/hero.jpg">` as LCP, no preload, no width/height. Assert BOTH `absences` entries present (lcp.preload-missing AND cls.image-dimensions-missing).
- [ ] B7.5 Privacy test `tests/security/codewindow-redaction.test.ts`: assert share-server's existing redaction pipeline strips `codeWindowRef` artifacts unless `--include-source` is set (extends ADR-005 scope per proposal).

## B8. Release prep

- [ ] B8.1 Update `packages/core/README.md` taxonomy section: brief on taxonomy v1 + link to ADR-006.
- [ ] B8.2 Update `packages/sourcemaps/README.md` with config docs.
- [ ] B8.3 Add changelog entry under `docs/CHANGELOG.md` for v2.0 — section "LLM-Native Output."
- [ ] B8.4 Tag commit messages with conventional-commit prefixes (`feat(taxonomy)`, `feat(sourcemaps)`, `feat(injection)`, `feat(absences)`, `feat(diagnoser)`). All commits use `nhoxtvt@gmail.com` per global git-identity config.
