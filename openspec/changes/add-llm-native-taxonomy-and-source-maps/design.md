# Design: LLM-Native Taxonomy + Source Maps

## Phase 1 source materials

- **Oracle (Phase 1)** (bg_dadd0977, 3m 33s): full grounded validation against the existing ohmyperf codebase. Confirmed `Page.addScriptToEvaluateOnNewDocument` is used in `cwv-collector.ts:85` and `longtask-collector.ts:44` for the install path; the `render-blocking.ts` finalize-time pattern is precedent for B4; Report v1.0.0 is frozen-additive; `cwv-inline-script.ts` is the build-time stringification pattern.
- **Metis (Phase 1)**: subagent failed five times consecutively (likely service-side transient). The orchestrator substituted a scope/risk pass synthesized from the proposal's "Critical considerations" + constraint set + v1 frozen-schema guarantees. Risks below are tagged `[orchestrator]` where Metis was substituted.
- **Oracle (Phase 4, reviewer-substitute)** (bg_17f1afc1, 4m 8s): Momus also failed (2× consecutively). Oracle was substituted as reviewer. Verdict: **NEEDS REVISION** with 8 critical-class items (mechanical fixes, half a day of edits, not a redesign). Strategic shape was confirmed correct; the implementation contract had factual claims about existing code that needed alignment with reality. **All 8 revisions have been applied** in the current artifact set (see §revisions-applied below).
- **Metis re-run recommendation**: All three Phase-1 risks the reviewer flagged are Metis-specialty class (false claims about existing patterns, missing API surface gaps). Strongly recommend a Metis re-run against the revised artifacts before B1 implementation starts. Tracked as an open item.

## Synthesis: settled decisions (high confidence)

| Decision | Resolution | Source |
| --- | --- | --- |
| Where taxonomy lives | `packages/core/src/taxonomy/v1.ts` as a frozen-object registry; leaf module. | Oracle §1 + §2 |
| Source-map I/O package boundary | New workspace package `@ohmyperf/sourcemaps`; `core` stays browser-safe. | Oracle §1 |
| Source-map library | `@jridgewell/trace-mapping` (NOT Mozilla `source-map`, NOT `@jridgewell/source-map`). | Oracle §5 |
| When source maps resolve | At `pluginRuntime.onReport`, never at collection. | Oracle §1 + §2 |
| Stack-capture injection mechanism | `Page.addScriptToEvaluateOnNewDocument` + `Runtime.addBinding('__ohmyperf_inj')`, mirroring `cwv-collector.ts:85`. | Oracle §2 + §5 |
| CSP fallback | `degradation: { capability: 'injection-attribution', reason }`. NEVER throw. | Oracle §2 (CSP) + orchestrator (constraint) |
| Code-window storage | Side artifact via `codeWindowRef: ArtifactRef`. Inline embedding deferred to v2.1. | Oracle §4 (JSON bloat) |
| Diagnoses + audits coexistence | Both surfaces emitted; audits unchanged; diagnoses additive. No deprecation in v1.x. | Oracle §2 |
| Absence-check determinism strategy | Snapshot DOM once at `onIdle`; absences compute at `onReport` from snapshot only. | Oracle §2 + §4 |
| Taxonomy distinctness rule | No two IDs share `(metric, repairArchetype)`. Lint-enforced. | Oracle §2 (operational check) |
| Taxonomy ID stability | ADR-006 codifies: published IDs cannot be removed/renamed in-version. Version bump for breakage. | Orchestrator + constraint requirement |
| Path traversal hardening | Refuse maps resolved outside `repoRoot`. Reject `../`. Symlink-aware. | Oracle §4 (security) |
| Source-map finalize budget | 3s total; 4-way concurrency; per-map 500ms timeout. Overflow → degradation. | Oracle §4 (perf) |
| Schema validation in CI | Regenerate `report.schema.json` from `types.ts`; fail CI on uncommitted diff. | Orchestrator (LLM-native consumer contract) |
| Privacy posture for code windows | Share-server redaction default-strips; `--include-source` opt-in. | Oracle §4 (privacy) |

## MVA scope (what ships in v1 of this change)

Per Oracle §3, the v1 of this change ships a deliberately narrower surface than the original brief:

- **12 taxonomy IDs**, not 25-30. (Adding more in v1.x is non-breaking; deferred IDs land as they unlock specific user workflows.)
- **LongTask source-map resolution only**. LCP/INP attribution source-mapping deferred to v2.1.
- **Single-hop injection chain**. Multi-hop TMS reconstruction deferred to v2.1.
- **5 absence checks** exactly. Additional checks are independent follow-ups; the abstraction supports them trivially.
- **Code windows as artifacts only**. Inline embedding deferred to v2.1.
- **No SPA UI for the code window itself** — `<DiagnosesPanel>` renders `file:line:col` text with external deep-link.
- **No HTML-source mapping** for static `<script src=...>` tags. Static tags get `injectionPath: undefined` in v1.

## Architecture (data flow)

```
                       collection phase                    finalize phase                  reporters
                       (browser running)                   (engine, post-onIdle)            (CLI, SPA, MD)
                                                                                              │
  CDP Page.addScript ┐                                                                        │
                     ├─► injection-collector ──► resource.injectionPath (raw urls/lines)      │
  injection-shim.js ─┘                                                          │             │
                                                                                ▼             │
  CDP DOM domain                                                       SourceMapResolver      │
   ├─► dom-snapshot.ts ──► report.runs[*].pluginData['ohmyperf:domSnapshot']    │             │
                                                              │                 ▼             │
                                                              │       resolves: longTask.sourceLocation,
                                                              │                 injectionPath[*]
                                                              ▼                                
                                                       diagnoser plugin                       │
                                                       (onReport)                             │
                                                              │                               │
                                                              ├─► AUDIT→DIAGNOSIS map ──► report.diagnoses
                                                              │                               │
                                                              └─► 5 absence checks ───► report.absences
                                                                            │                  │
                                                                            │      report.taxonomyVersion = 'v1'
                                                                            ▼                  ▼
                                                                                   <DiagnosesPanel> + <AbsencesPanel>
                                                                                   markdown § Diagnoses / § Absences
                                                                                   HTML (CLI viewer) mirrors SPA
```

Key invariants:
- Taxonomy is a leaf — no cycle back into core/collectors.
- Source-map work happens once, at `onReport`, never during collection.
- DOM snapshot is read once, then absences compute from snapshot — never re-query DOM.
- Diagnoses and absences are sorted by stable keys before emission (byte-deterministic).
- Old `audits[]` is preserved verbatim — backward compat for pre-v2 readers.

## Risks & mitigations

### Risks identified by Oracle

| Risk | Mitigation |
| --- | --- |
| Source-map disk I/O blocks finalize | 3s budget; concurrency 4; per-map 500ms; degradation on overflow |
| Stack-capture shim overhead in-page | `new Error().stack` ~5μs in V8; cap at 200 captures per page; `truncated: true` flag |
| Code-window JSON bloat | Artifact-by-default; inline embedding rejected in v1 config |
| CSP `script-src 'nonce-...'` blocks shim | CDP `addScriptToEvaluateOnNewDocument` bypasses page CSP; fallback degradation if even that fails |
| Path traversal via crafted sourceMappingURL | Symlink-resolve then boundary-check against `repoRoot` |
| Source maps leak source code on shared reports | Share-server redaction extended (ADR-005 amendment) to strip `codeWindow` artifacts by default; `--include-source` flag required to ship them |
| Absences non-deterministic | Snapshot DOM once; absences operate on snapshot only; determinism test runs 10× per fixture in CI |

### Risks identified by orchestrator substitute

| Risk | Mitigation |
| --- | --- |
| `injectionPath` re-entrancy: framework code reattaches `<script>` nodes → double-emit | WeakSet guard in shim ensures one emit per element |
| Browser stack-format variance | ohmyperf only targets V8 (CDP-bound); fixed format. Documented in ADR-006. |
| Cross-origin source maps | Same-origin or `repoRoot`-discoverable only; refuse network fetch |
| Eval / data:URL / inline scripts have no sourceMappingURL | Resolver returns null + warning; absence of source mapping is not an error |
| Webpack chunked maps (index source maps v3) | `@jridgewell/trace-mapping` natively supports index maps; tested in B2.7 fixture variant |
| Service worker / web worker injection | Out of scope v1; injection from a worker results in `injectionPath: undefined`; documented MVA cut |
| Taxonomy curation governance | ADR-006 distinctness lint + codeowners on `taxonomy/v1.ts` |
| Backward compat: old Reports lack `diagnoses` | SPA viewer's `report-viewer.tsx` checks `?.length` before rendering panels |
| JSON schema drift | CI regenerates and `git diff --quiet` gates the build |
| `report.warnings` / `report.degradations` fields may not yet exist in types | B5.4 task ensures they do, additive only |
| Diagnoser plugin not registered by default in extension | ADR documents the asymmetry; extension emits degradation field |

### Risks deliberately out of scope of this change

- **Performance Insights v2 compatibility.** If/when ohmyperf adopts `@paulirish/trace_engine` insights (separate change), the integration is *map their IDs into our taxonomy*, never adopt theirs as canonical. Documented in proposal §Risks.
- **i18n.** Diagnoses panel English-only in v1; v1.1 i18n track owns translation strings (consistent with existing `messages/vi.json` placeholder pattern from change `add-diagnostic-insights`).

## Phasing rationale (why this order)

1. **B1 first** — Taxonomy is the dictionary every other piece references. B4 absences carry taxonomy IDs; the diagnoser mapping table references them. Without B1, none of B2/B3/B4 can land.
2. **B2 before B3** — B3 injection-collector captures raw `{ url, line, column }` from in-page stacks; B2's `SourceMapResolver` resolves those raw entries during `onReport`. Without B2, `Resource.injectionPath` would carry minified locations only — agent-unusable.
3. **B4 alongside B1** — Absence checks are independent of B2/B3 except where individual checks happen to *use* source locations (none of the v1 five do — see §B4 spec). So B4 can land in parallel with B2/B3.
4. **B5 alongside B1** — ADR-006 codifies stability rules before anyone modifies `v1.ts`. Schema regen + JSON-schema fixture validation lands here too.
5. **B6 last** — SPA UI is the wire-format consumer. Freezing the wire format (B1–B5) first prevents redesigning the viewer mid-change. Bundle-budget gate is a CI assertion at the end.
6. **B7 throughout** — E2E ground-truth tests are listed last for organizational clarity but each test is added in the same PR as the feature it exercises.
7. **B8 final** — Release prep + docs + changelog.

## Validation strategy (mapping to "ground truth" mandate)

| Validation | Mechanism | CI gate |
| --- | --- | --- |
| Taxonomy IDs stable | `tests/unit/taxonomy/stability.test.ts` snapshots ID list | Yes |
| Taxonomy distinct | `tests/unit/taxonomy/distinctness.test.ts` | Yes |
| Source-map resolves to known src | `tests/e2e/source-map-resolution.test.ts` (`sourcemap-fixture`) | Yes |
| Path traversal blocked | `tests/unit/sourcemaps/path-traversal.test.ts` | Yes |
| Source-map budget enforced | `tests/unit/sourcemaps/budget.test.ts` | Yes |
| Injection attribution to source line | `tests/e2e/injection-attribution.test.ts` (`injection-fixture`) | Yes |
| Injection collector CSP-degrades not crashes | `tests/e2e/injection-csp-degradation.test.ts` | Yes |
| Absences fire on expected fixtures | `tests/e2e/absence-detection.test.ts` | Yes |
| Absences do NOT fire on golden fixture | `tests/e2e/absence-golden.test.ts` (golden-fixture) | Yes |
| Absences deterministic | `tests/determinism/absences.test.ts` (10× run) | Yes |
| Bundle ≤ 200KB viewer / 500KB deck | `bundlesize` existing config | Yes |
| Schema regen clean | `pnpm gen:schema && git diff --quiet` | Yes |
| Backward-compat: old report renders | `tests/e2e/legacy-report-render.test.ts` | Yes |
| Privacy: code window redacted by default | `tests/security/codewindow-redaction.test.ts` | Yes |

## Revisions applied (Phase-4 reviewer feedback)

This artifact set incorporates all 8 critical-class revisions from the Phase-4 reviewer:

| Reviewer finding | Resolution |
| --- | --- |
| `Runtime.addBinding` falsely claimed as existing pattern | Switched B3 to polling-readback pattern (`Runtime.evaluate` + `window.__ohmyperf_injections`) matching existing `cwv-collector.ts` and `longtask-collector.ts`. Documented in proposal §"CDP primitive note". |
| `ReportCtx.artifacts.put` referenced but doesn't exist | Added B5.5 as canonical task introducing `ReportCtx.artifacts.put` + `Report.artifacts.codeWindowRefs` (additive optional). |
| `Report.warnings.push` / `Report.degradations.push` type errors | Hoisted both to top-level `Report.warnings?` and `Report.degradations?` as `ReadonlyArray` additive optional fields. Plugins MUST return new Report (returned-new-Report pattern), never `.push`. Documented in proposal §"Report.warnings / Report.degradations are top-level". |
| `DriverCapability` is closed union — `'source-maps'`/`'injection-attribution'` are type errors | Introduced new `PluginDegradationCapability` union (`'source-maps' \| 'injection-attribution' \| 'absences' \| 'diagnoser'`) for the new top-level `Report.degradations`. `ReportMeta.degradations` (using `DriverCapability`) is UNTOUCHED. |
| `RunReport.pluginData` doesn't exist (snapshot path was wrong) | Added `RunReport.pluginData?: Readonly<Record<string, unknown>>` as additive optional field in B1.7. Snapshot stored at `report.runs[i].pluginData['ohmyperf:domSnapshot']`. |
| Multi-run determinism under-specified | Added B4.1a + spec scenario in `negative-space-audits/spec.md`: absences derived from `runs[0]` (cold) snapshot only; `runs[1..N]` snapshots ignored. |
| B3 emit-point ambiguity (creation vs insertion) | Pinned in B3.1: emit happens ONLY on DOM insertion via `appendChild`/`insertBefore`/`replaceChild`. `createElement` and `src` setter only refresh `__omp_created_stack`. WeakSet `__omp_emitted` guards against double-emit. |
| `SourceLocation` lifecycle (raw URL vs resolved path) ambiguous | Added `SourceLocation.resolved?: boolean` field. Pre-resolution entries have `resolved: false` and `file` = minified URL; sourcemap-resolver rewrites to `resolved: true` + `file` = `repoRoot`-relative path. Documented as Pinned design decision. |
| `AUDIT_TO_DIAGNOSIS` v1 coverage unclear | Expanded B4.8 to commit to 8 v1 mappings explicitly. Sparseness is non-breaking; additions are non-version-bumping per ADR-006. |
| Schema generator unspecified (drift risk) | Pinned `ts-json-schema-generator@^1.5.0` with deterministic flags in B1.6. |
| Vite virtual / esbuild inline / webpack v3 index maps not covered | Added B2.7a, B2.7b, B2.7c fixture variants + spec scenarios. Virtual paths resolve to synthetic `SourceLocation` with `file: '<virtual:...>'`. |
| `eval()` / `data:` URL scripts not covered | Added B2.7d, B2.7e variant fixtures + spec scenarios. Explicit warning IDs (`source-maps.unresolvable-inline`, `.unresolvable-data-url`). |
| Windows path-traversal scenarios missing | Added B2.8a + four spec scenarios covering UNC paths, forward-slash mixing, drive-letter case, symlink-resolution. CI matrix gains `windows-latest` for this test. |
| Bundle-budget measurement methodology unspecified | Added gzip-level-9 / pre-CDN / dynamic-import-isolated `React.lazy(...)` specifics to Pinned design decisions and B6.6. |

The reviewer's Verdict was NEEDS REVISION on the pre-revision artifact. With these revisions applied, the artifact set is ready for implementation pending a Metis re-run (recommended but non-blocking).

## Open questions for the user (to confirm before implementation)

1. **Do diagnoses entirely replace `audits` in v2.0, or coexist permanently?** Current design says coexist permanently in v1.x; v2 removal of `audits` is a deferred decision. Confirm.
2. **Should the SPA show code-window text inline (lazy-fetch on expand) in v1, or text-only `file:line:col`?** Current design says text-only with external deep-link in v1; inline code-window viewer is v2.1.
3. **`repoRoot` discovery — is the assumption "the directory ohmyperf is invoked from"?** Current default. Some users (CI runners) might pass it explicitly. Confirm the default + that the CLI exposes `--repo-root`.
4. **GitHub deep-link config** — should `<DiagnosesPanel>`'s `file:line:col` link to GitHub when a `repoRemote` config is present? If so, what's the auto-discovery story (`git remote get-url origin` at measure time)?
5. **Taxonomy versioning collision with Lighthouse 13 audits** — if Lighthouse adds a `lcp-discovery-insight` ID and we already have `lcp.lcp-image-not-discoverable`, do we map theirs into ours (preferred per Oracle "never adopt as canonical"), or alias? Default: map into ours.
