# Tasks: Agent Fix Loop (Track E)

## E0. Dependency gating (DO NOT skip)

- [ ] E0.1 **Confirm dependency-stack APIs are locked** before any coding. Record in this file the exact exports + version that Track E will consume:
  - [ ] E0.1.a Track #1 (SPRT + provenance): exported `runSPRT()` signature, `ProvenanceFingerprint` shape, package + version. Owner sign-off.
  - [ ] E0.1.b Track #2 (Diagnosis taxonomy): exported `TaxonomyId` enum, per-ID `Evidence` shape, **per-ID `firstSeenIn(taxonomyId): string` API**, **taxonomy-version-pinned diagnosis pass** (or fall-back of exposing `firstSeenIn` so Track E can filter), package + version. Owner sign-off.
  - [ ] E0.1.c Track #4 (reproducer store): `reproducerRef` shape on Report, `loadReproducer(reportId)`, `runReproducer(reproducer, runs)`, package + version. Owner sign-off.
- [ ] E0.2 Resolve the working-title ambiguity flagged by Oracle review: the prior 4 OpenSpec changes in this v2 series are named `add-metric-accuracy`, `add-diagnostic-insights`, `add-counterfactual-attribution`, and (placeholder TBD for #4). Update this proposal's `Dependencies` table to point at the actual change names + spec sections once finalized.
- [ ] E0.3 Bump `engines.node` to `>=22.0.0` for all 4 new packages, matching Track A's pinned floor.
- [ ] E0.4 Reserve workspace catalog versions: `fast-json-patch ^3.1`, `nanoid ^5`, `async-mutex ^0.5`, `zod ^3` (if not already pinned by mcp-server), `parse-diff ^0.11` (deferred to v1.1).

## E1. `@ohmyperf/worktree-manager` (foundational; do this first)

- [ ] E1.1 Create package skeleton: `packages/worktree-manager/{package.json, src/index.ts, tsconfig.json}`. Name `@ohmyperf/worktree-manager`. Private to workspace (not published to npm in v1).
- [ ] E1.2 Implement `create(repoRoot, baselineRef): Promise<Worktree>` using `child_process.exec('git worktree add --detach <path> <ref>')`. Path = `/tmp/ohmyperf-verify-${nanoid(16)}`. Set `chmod 0700`.
- [ ] E1.3 Implement PID lock file: write `${worktree}/.ohmyperf-lock` containing `{ pid: process.pid, createdAt: Date.now() }`.
- [ ] E1.4 Implement `destroy(worktree, { keep?: boolean }): Promise<void>`. On `keep=true`, log retention path; else `git worktree remove --force ${path}` with `rm -rf` fallback.
- [ ] E1.5 Implement atexit registration: on `process.on('exit'|'SIGINT'|'SIGTERM')`, sync-destroy any active worktrees not marked `keep`. Test by spawning a child process that creates a worktree then `process.kill('SIGINT')`.
- [ ] E1.6 Implement `safety.assertInRepoRoot(filePath, repoRoot)`: rejects `..`, absolute paths, paths outside `repoRoot`, refusal list (`.git/`, `.ohmyperf/`, `node_modules/`, `.env*`, `.ssh/`, `.aws/`), and any symlinked parent. Each rejection throws a typed `WorktreeSafetyError` with `code` and `path`.
- [ ] E1.7 Implement `janitor.sweep()`: enumerate `/tmp/ohmyperf-verify-*`, parse `.ohmyperf-lock`, remove if missing-lock OR `now - createdAt > 24h` OR `process.kill(pid, 0)` throws `ESRCH`. Called automatically on package import; idempotent.
- [ ] E1.8 Unit tests (`packages/worktree-manager/test/`):
  - [ ] E1.8.a Path traversal + refusal list: every category tested — VCS (`.git/HEAD`), ohmyperf internals (`.ohmyperf/cache`), deps (`node_modules/x.js`), env (`.env`, `.env.local`, `.env.production`, `nested/.env.test`), SSH keys (`.ssh/id_rsa`, `nested/id_ed25519`, `id_rsa.pub`), cloud creds (`.aws/credentials`, `.gnupg/secring.gpg`, `.azure/`, `.gcloud/`), cert/key extensions (`server.pem`, `cert.key`, `bundle.pfx`, `cert.p12`, `client.crt`), cloud config (`wrangler.toml`, `netlify.toml`, `vercel.toml`), IaC state (`terraform.tfstate`, `terraform.tfstate.backup`), npm/yarn/pip credentials (`.npmrc`, `.yarnrc.yml`, `.pypirc`, `.git-credentials`, `.netrc`), absolute paths (`/tmp/foo`, `/etc/passwd`), traversal (`../../etc/passwd`, `foo/../../bar`). Minimum 30 reject cases.
  - [ ] E1.8.b Symlink rejection: create symlinked parent dir in a tmp test repo, assert reject.
  - [ ] E1.8.c Janitor: mock filesystem + mock process tree; verify cleanup of stale, preservation of alive-PID.
  - [ ] E1.8.d Atexit: child-process test for SIGINT cleanup.

## E2. `@ohmyperf/patch-applier`

- [ ] E2.1 Create package `packages/patch-applier/`.
- [ ] E2.2 Define `CanonicalPatch` + `CanonicalEdit` types in `src/types.ts` exactly as in `design.md` §3.
- [ ] E2.3 Implement `normalize(input): CanonicalPatch`:
  - [ ] E2.3.a `kind: 'jsonPatch'` path: use `fast-json-patch` for RFC 6902 parse. Map ops with path `/files/<relative/path>` to `CanonicalEdit { op: 'create', filePath, newContent: value }`. Other paths reject as out-of-scope for v1.
  - [ ] E2.3.b `kind: 'unifiedDiff'` (v1.1 — stub returning `error: 'not-implemented-in-v1'`).
  - [ ] E2.3.c `kind: 'worktreePath'` (v1.1 — stub returning `error: 'not-implemented-in-v1'`).
- [ ] E2.4 Implement `id` field on `CanonicalPatch` = `sha256(canonical-JSON of edits, sorted by filePath)`. Cover sort-determinism + EOL normalization (`\r\n` → `\n` BEFORE hashing).
- [ ] E2.5 Implement `apply(canonicalPatch, worktreeRoot)`:
  - [ ] E2.5.a For each edit: `worktree-manager.safety.assertInRepoRoot(filePath, worktreeRoot)`.
  - [ ] E2.5.b For `op: 'replace' | 'remove'` with `oldSha`: read current file, compute sha256, compare. On mismatch throw `PatchPreconditionFailed`. (`oldSha` optional in v1; recommended for agent-generated patches.)
  - [ ] E2.5.c Apply edits in deterministic order (sort by `filePath`).
  - [ ] E2.5.d Atomic semantics: stage all writes to a tmp dir inside worktree, then atomic-rename into place. On any failure mid-batch, roll back.
- [ ] E2.6 Unit tests: JSON Patch → CanonicalPatch round-trip; oldSha mismatch rejection; atomic rollback test (force one edit to fail, assert others reverted).

## E3. `@ohmyperf/repair-archetypes`

- [ ] E3.1 Create package `packages/repair-archetypes/`.
- [ ] E3.2 Implement `Archetype` + `Framework` + `DetectedFramework` types per `design.md` §3.
- [ ] E3.3 Implement `detectFramework(repoRoot): Promise<DetectedFramework>` per `design.md` §5 algorithm. Cache per-`repoRoot` for process lifetime.
- [ ] E3.4 Implement registry index `src/index.ts` exporting `resolve(diagnosisId, framework): Promise<Archetype | null>` with **lazy dynamic-import** of each archetype module — eager only the registry map (id → import-path).
- [ ] E3.5 Archetype #1: `lcp.preload-missing`
  - [ ] E3.5.a Evidence schema (zod): `{ lcpResourceUrl: string, lcpResourceType: 'image' | 'font' | 'script' | 'video', lcpElement: string }`.
  - [ ] E3.5.b `src/archetypes/lcp.preload-missing/next.ts`: template adds `metadata.other.preload` entry in `app/layout.tsx` (Next.js 14 app-router pattern). Documented in inline JSDoc with citation.
  - [ ] E3.5.c `src/archetypes/lcp.preload-missing/plain.ts`: template adds `<link rel="preload" href="..." as="...">` in `<head>` of `index.html`.
  - [ ] E3.5.d `predict.ts`: `predict(evidence, env) → { lcp: { delta: -(0.7 × evidence.estimatedResourceLoadMs), ci95: [-..,-..] } }`. Document the heuristic; calibration v2.
  - [ ] E3.5.e `fixture/`: minimal `input.report.json` + expected `edits.json` for both frameworks.
  - [ ] E3.5.f Unit tests: template returns expected edits on canonical evidence; evidence schema rejects malformed input.
- [ ] E3.6 Archetype #2: `lcp.render-blocking-font` (Next.js + plain-html). Same structure as E3.5.
- [ ] E3.7 Archetype #3: `cls.image-no-dimensions` (Next.js + plain-html). Same structure as E3.5.
- [ ] E3.8 Bundle-size CI gate: `pnpm size:archetypes` script + GitHub Action step. Fails build if eager portion > 8KB gz OR total dist > 50KB gz.
- [ ] E3.9 ADR drafted for archetype governance: `openspec/adrs/000X-archetype-versioning.md` (governance, versioning, per-archetype canonical fixture requirement, ADR required for each new archetype).

## E4. `@ohmyperf/agent-loop` — core library

- [ ] E4.1 Create package `packages/agent-loop/`.
- [ ] E4.2 Define types in `src/types.ts` per `design.md` §3 (VerifyArgs, VerifyResult, ProposeArgs, RepairProposal, MetricDelta, Verdict, FocusMetric, Edit, Diagnosis).
- [ ] E4.3 Implement `proposeFix(args): Promise<RepairProposal | NullProposal>`:
  - [ ] E4.3.a Load Report by `reportId` via core report-store.
  - [ ] E4.3.b Find `Diagnosis` in `Report.diagnoses[]` where `d.id === diagnosisId`. If missing → error.
  - [ ] E4.3.c Resolve framework via `repair-archetypes.detectFramework(repoRoot)`. If confidence < 0.7 → use `plain-html`.
  - [ ] E4.3.d Resolve archetype via `repair-archetypes.resolve(diagnosis.taxonomyId, framework)`. If null → return `{ proposal: null, reason: 'no-archetype' }`.
  - [ ] E4.3.e Validate `diagnosis.evidence` against `archetype.evidenceSchema`. On fail → return `{ proposal: null, reason: 'evidence-incomplete', missing: [...] }`.
  - [ ] E4.3.f Generate `edits = archetype.template(evidence)` and `predictedDelta = archetype.predict(evidence, env)`.
  - [ ] E4.3.g Compute `proposalId = sha256(diagnosisId + reportId + archetypeId + archetypeVersion + ohmyperfVersion)`. Deterministic; cache the result keyed by proposalId.
  - [ ] E4.3.h Return `RepairProposal` with `verifyCommand` and `archetypeSourceUrl` strings.
- [ ] E4.4 Implement `verifyFix(args): Promise<VerifyResult>`:
  - [ ] E4.4.a Acquire per-`baselineReportId` mutex (`async-mutex`).
  - [ ] E4.4.b Reject `apply: 'in-place'` in v1 with clear error `'in-place-mode-not-in-v1'`.
  - [ ] E4.4.c Load baseline Report + `reproducerRef` via Track #4 API. If reproducer missing → throw `'baseline-lacks-reproducer'`.
  - [ ] E4.4.d Pre-flight: Node major version match between `baseline.provenance.nodeVersion` and `process.versions.node`. Mismatch → throw `'node-version-mismatch'`.
  - [ ] E4.4.e Pre-flight: `df -h /tmp` free space ≥ 2GB. Else throw `'insufficient-disk'`.
  - [ ] E4.4.f Normalize patch via `patch-applier.normalize(patch) → CanonicalPatch`. Validate every `filePath` via `worktree-manager.safety.assertInRepoRoot`.
  - [ ] E4.4.g Compute `verifyKey = sha256(baselineReportId + canonicalPatch.id + reproducerHash + ohmyperfVersion)`. If cache hits → release mutex, return cached.
- [ ] E4.4.h Create worktree via `worktree-manager.create(repoRoot, baseline.gitRef)`.
- [ ] E4.4.h2 **Reproducer health pre-flight**: invoke `runReproducer(reproducerRef, worktree.path)` ONCE on the unpatched HEAD with the configured per-run timeout. If it throws OR returns an empty/error Report, abort with `error: "reproducer-fault"` and destroy worktree.
- [ ] E4.4.i Apply patch via `patch-applier.apply(canonicalPatch, worktree.path)`.
  - [ ] E4.4.j `prepareWorktree(framework)` hook: hardlink `node_modules` if lockfile unchanged (`cp -al`), else `pnpm install --frozen-lockfile --store-dir=~/.ohmyperf/pnpm-store`. Clear `.next/`, `.turbo/`, `.vite/` caches; set `TURBO_CACHE_DIR` per-worktree.
  - [ ] E4.4.k SPRT loop: per-metric SPRT runner from Track #1. After each post run, compute deltas + p-values; check Holm-Bonferroni step-down termination; cap at `maxRuns` (default 30; `args.runs` overrides).
  - [ ] E4.4.l Aggregate post runs into a fresh Report; store via core report-store; capture `postReportId`.
  - [ ] E4.4.m Side-effect detection: run full diagnosis pass on post Report; compute `newInsights[]` (taxonomy not in baseline, severity ≥ medium, magnitude > archetype.noiseFloor) and `regressedInsights[]` (same taxonomy, worse magnitude).
  - [ ] E4.4.n Compute CI95 per metric via Mann-Whitney + Hodges-Lehmann + 1000-sample bootstrap.
- [ ] E4.4.n2 If `verifyFix` was invoked via `proposal: proposalId`, look up the proposal record's `predictedDelta`. For each metric in `deltas`, set `deltas[m].predicted = proposal.predictedDelta[m]?.delta` and `deltas[m].withinCI = (predicted !== undefined) && (ci95[0] <= predicted <= ci95[1])`. For raw-patch invocations (no proposalId), leave both fields undefined.
  - [ ] E4.4.o Aggregate verdict: any `regression` → `regression`; else any `improvement` AND no `regression` → `improvement`; all `no-effect` → `no-effect`; else `inconclusive-noisy`. Boundary zone `noiseFloor*0.9..1.1` downgrades to `inconclusive-noisy`.
  - [ ] E4.4.p Assemble `VerifyResult` with `schemaVersion: '1.0.0'`. Store via core report-store.
  - [ ] E4.4.q Cleanup worktree via `worktree-manager.destroy(worktree, { keep: args.keepWorktree })`.
  - [ ] E4.4.r Cache `VerifyResult` under `verifyKey` in the LRU cache (default `OHMYPERF_VERIFY_CACHE_MAX = 256`). Evict LRU entry on overflow. Persisted copy still resolvable from report-store by `VerifyResult.id` even after eviction.
  - [ ] E4.4.s Release mutex. Return.
- [ ] E4.5 `verdict.ts`: implement `holmBonferroni(pValues, alpha)` step-down; implement `verdictFromMetricDeltas(deltas, sprtResults, noiseFloors): Verdict`. Unit-tested with synthetic streams.
- [ ] E4.6 `side-effects.ts`: implement `diffDiagnoses(baseline, post, archetypes): { newInsights, regressedInsights }`.
- [ ] E4.7 `idempotency.ts`: `computeProposalId`, `computeVerifyKey`, `computeReproducerHash`. All deterministic, no wall-clock or PID.
- [ ] E4.8 Unit tests:
  - [ ] E4.8.a SPRT verdict on synthetic distributions (true-positive, true-negative, false-positive rates within target).
  - [ ] E4.8.b Holm-Bonferroni correctness across 1, 2, 6 metrics.
  - [ ] E4.8.c Idempotency: same inputs → same proposalId / verifyKey across process restarts.
  - [ ] E4.8.d Side-effect detection: synthetic baseline with `lcp.preload-missing`, post with `cls.font-swap-shift` (new) and `cls.image-no-dimensions` (same id worse evidence) — newInsights and regressedInsights each have exactly one entry.

## E5. MCP integration (`apps/mcp-server`)

- [ ] E5.1 Register tool `verify_fix` with zod-validated args matching `VerifyArgs`. Delegate to `agent-loop.verifyFix`.
- [ ] E5.2 Register tool `propose_fix` with `ProposeArgs`. Delegate.
- [ ] E5.3 Register tool `list_archetypes`: returns the archetype registry index (id, version, framework, diagnosisId).
- [ ] E5.4 Register tool `get_archetype({ id, version? })`: returns full archetype metadata including evidenceSchema (zod → JSON schema), template-source-link, predicted-delta-formula description.
- [ ] E5.5 Register MCP resource `ohmyperf://archetypes/<id>@<version>` resolving to the full archetype metadata + canonical fixture link.
- [ ] E5.6 Register MCP resource `ohmyperf://verify-results/<id>` resolving to stored `VerifyResult` JSON.
- [ ] E5.7 Bind server to `127.0.0.1` by default. Document `OHMYPERF_MCP_TOKEN` env requirement for non-loopback exposure.
- [ ] E5.8 Per-process rate limit: max 3 concurrent verify_fix calls, max 100/hour. Return `429-style` MCP error on exceed.
- [ ] E5.9 Tool-args size cap: 256KB max. For larger patches in v1.1, accept by `worktreePath` reference.

## E6. CLI integration (`apps/cli`)

- [ ] E6.1 `ohmyperf propose --report=<reportId> --diagnosis=<diagnosisId> [--json]` — invokes `agent-loop.proposeFix`. Pretty-prints proposal or JSON output.
- [ ] E6.2 `ohmyperf verify --baseline=<reportId> --patch=<path-to-json-patch.json> [--runs=N] [--focus=lcp,cls] [--keep-worktree] [--json]` — invokes `agent-loop.verifyFix`. Default `apply: 'worktree'`.
- [ ] E6.3 `ohmyperf verify --proposal=<proposalId>` (shorthand) — looks up cached proposal, runs verify with its `edits` converted to a JSON Patch.
- [ ] E6.4 In-place mode: rejected in v1 with clear error pointing to v1.1 plans.
- [ ] E6.5 CLI integration tests against fixture corpus (read-only end-to-end on 3 fixtures).

## E7. Acceptance corpus (`tests/agent-fix-loop-corpus/`)

- [ ] E7.1 Create fixture `lcp-preload-missing-next/` per `design.md` §8.
- [ ] E7.2 Create fixture `lcp-preload-missing-plain/`.
- [ ] E7.3 Create fixture `lcp-render-blocking-font-next/`.
- [ ] E7.4 Create fixture `lcp-render-blocking-font-plain/`.
- [ ] E7.5 Create fixture `cls-image-no-dimensions-next/`.
- [ ] E7.6 Create fixture `cls-image-no-dimensions-plain/`.
- [ ] E7.7 Create fixture `lcp-fix-causes-cls-regression/` (SIDE-EFFECT). Document the mechanism in README — preload an image whose loading triggers a webfont swap that shifts adjacent text.
- [ ] E7.8 Create fixture `no-archetype-available/` — diagnosis `js.unused-export` (intentionally not in v1 archetype set). Assert `proposeFix` returns `{ proposal: null, reason: 'no-archetype' }`.
- [ ] E7.9 Create fixture `evidence-incomplete/` — `lcp.preload-missing` diagnosis with missing `lcpResourceUrl`. Assert `proposeFix` returns `{ proposal: null, reason: 'evidence-incomplete', missing: ['lcpResourceUrl'] }`.
- [ ] E7.10 Create fixture `inconclusive-noisy/` — fixture where intrinsic measurement noise > effect size. Assert verdict `inconclusive-noisy` after `maxRuns=20`.
- [ ] E7.11 Harness script `scripts/run-corpus.mjs`: iterates fixtures, runs full propose→verify loop (≤3 iterations per fixture), asserts verdict matches `expected-verdict.json`. Output JUnit XML for CI.
- [ ] E7.12 CI gate: `pnpm test:corpus` MUST pass on ≥8/10 fixtures (the 2 expected-fail fixtures are the failure-mode ones). Wired into PR-blocking CI.

## E8. Performance + safety hardening

- [ ] E8.1 Implement `prepareWorktree(framework)` hooks per framework: Next.js (clear `.next/`), plain-html (no-op), Remix/Astro/Vite (v2). Hook surface declared in `agent-loop` so v2 frameworks can plug in.
- [ ] E8.2 Implement `cp -al <repoRoot>/node_modules <worktreePath>/node_modules` (Linux/macOS hardlink) when ALL of the following are true: (a) worktree's `pnpm-lock.yaml` hashes identical to repoRoot's `pnpm-lock.yaml`; (b) `<repoRoot>/node_modules` exists and is not empty; (c) the applied patch did NOT modify `package.json` or `pnpm-lock.yaml`. On any of these failing, fall back to `pnpm install --frozen-lockfile --store-dir=~/.ohmyperf/pnpm-store`. On Windows: junctions are not safe for `node_modules`; always fall back to `pnpm install`. Document the invariants in the worktree-manager README. The hardlink source is the USER'S REPO ROOT `node_modules` (not "baseline" — baseline was a measurement, not a directory).
- [ ] E8.3 Concurrency: `agent-loop` exports a pool with max-3 concurrent worktrees (configurable via `OHMYPERF_VERIFY_MAX_CONCURRENT`). Per-baseline mutex ensures same baseline serializes.
- [ ] E8.4 Disk-quota pre-flight check (E4.4.e) with clear error message + cleanup hint.
- [ ] E8.5 Timeout: 10-minute per-verify wall-clock cap (configurable). On timeout, kill worktree process tree, mark verifyKey as `failed: timeout`, return error.
- [ ] E8.6 ADR drafted for worktree safety model: `openspec/adrs/000Y-worktree-safety-model.md`.

## E9. Docs

- [ ] E9.1 Add `packages/agent-loop/README.md` with library-call examples.
- [ ] E9.2 Add `packages/repair-archetypes/README.md` listing archetypes and governance.
- [ ] E9.3 Update root README "Differentiators" section: add Track E row to the competitor comparison table.
- [ ] E9.4 Add `docs/mcp-tools.md` documenting `verify_fix`, `propose_fix`, `list_archetypes`, `get_archetype`.
- [ ] E9.5 Document the 3 patch input formats (v1: JSON Patch only; v1.1: unified diff, worktreePath).
- [ ] E9.6 Document the `in-place` deferral and v1.1 roadmap.

## E10. Bundle + size gates

- [ ] E10.1 `pnpm size:archetypes` script measuring `dist/index.js` + `dist/registry.json` gz size. Fails if eager > 8KB gz.
- [ ] E10.2 Total dist size measurement summed across lazy chunks. Fails if total > 50KB gz.
- [ ] E10.3 CI step wiring.

## E11. Phase gates

- **Phase 1 (Foundation)**: E1 + E2 complete + tested. Worktree + patch apply work in isolation.
- **Phase 2 (Archetypes)**: E3 complete; 3 archetypes × 2 frameworks unit-tested; bundle budget green.
- **Phase 3 (Loop)**: E4 complete; agent-loop verifyFix + proposeFix unit-tested end-to-end with mock SPRT.
- **Phase 4 (Surfaces + Corpus)**: E5 + E6 + E7 complete; CI gate `pnpm test:corpus` green on ≥8/10.
- **Phase 5 (Hardening + Docs)**: E8 + E9 + E10 complete.

Each phase MUST complete fully before the next begins. **Phase 1 cannot start until E0.1 dependency lock is recorded.**

## E12. Out-of-scope (do NOT do in this change)

- Adding `in-place` apply mode. v1.1.
- Adding unified-diff or worktreePath patch inputs. v1.1.
- Adding Remix, Astro, Vite framework detectors or archetypes. v2.
- Adding more than 3 archetypes. v2.
- Calibrating predictor functions against real telemetry. v2 (needs production data).
- Archetype hot-reload or user-defined archetypes. v2.
- Cloud-side verify execution. Not in scope.
- AST-aware multi-file refactors. v2.
- Modifying the `Report` schema. VerifyResult is a sibling type.
