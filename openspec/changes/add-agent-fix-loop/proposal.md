# Proposal: Agent Fix Loop — Propose · Patch · Verify (Track E, killer flagship)

## Why

OhMyPerf v2 owns the **measure → diagnose** half of web-performance work (Tracks A–D: accurate metrics, diagnostic insights, counterfactual attribution, reproducible re-runs). The other half — **propose → patch → re-measure → verify** — is where competitors fail:

| Competitor | What they do | What they CAN'T do |
|---|---|---|
| Lighthouse-CI | Measure synthetic CWV in CI | No patch loop, no repo access, no verification |
| GitHub Copilot / Cursor | Generate patches | No measurement, no statistical verdict, no re-run loop |
| SpeedCurve / Calibre | Cloud measurement + trend tracking | No repo access, no patch, no fix verification |
| chrome-devtools-mcp | Browser introspection via MCP | No persistence, no patch loop, no statistical rigor |

**OhMyPerf v2 owns BOTH halves.** This change ships the second half: two MCP tools that close the loop from a diagnosis to a verified, statistically-significant fix that the user can review, apply, and ship.

This is the feature competitors cannot replicate without rebuilding the entire ohmyperf engine. **It is the v2 differentiator.**

### Concrete user value

After this change lands, an agentic IDE (Claude Code, Cursor, future Copilot Workspace) using the ohmyperf MCP server can:

1. Read a Report and pick a diagnosis (e.g. `lcp.preload-missing` with evidence `{ lcpResourceUrl: "/hero.jpg", lcpResourceType: "image" }`).
2. Call `propose_fix({ reportId, diagnosisId })` → receive a typed `RepairProposal` containing concrete file edits, predicted LCP delta with CI95, and a `verifyCommand`.
3. Optionally surface the proposal to the human ("apply this preload edit?"), let the user accept/edit/reject.
4. Call `verify_fix({ baselineReportId, patch })` → ohmyperf creates a git worktree, applies the patch, replays the baseline reproducer N times (SPRT-guided), and returns a verdict: **improvement** (p<0.05 + directional), **regression**, **no-effect**, or **inconclusive-noisy** — plus a list of new diagnoses introduced as side-effects (e.g. fixing LCP caused CLS to regress).
5. Iterate: on `regression` or `no-effect`, propose a different fix; on `improvement`, commit.

The result is a **closed loop with statistical rigor and side-effect visibility** — neither Copilot nor Lighthouse-CI can do this today, and the architectural lock-in (you need the engine + the diagnosis taxonomy + reproducers + SPRT runner) means competitors cannot replicate it incrementally.

## What changes

### Added — three new packages

- **`packages/agent-loop/`** (NEW, `@ohmyperf/agent-loop`) — library-grade primitives `verifyFix()` and `proposeFix()`. Not a plugin; lifecycle is library-call, not measurement-time hook. Exposes a canonical `VerifyResult` schema-versioned record sibling to `Report` (references `baselineReportId` + `postReportId` by ID; never mutates either Report).
- **`packages/repair-archetypes/`** (NEW, `@ohmyperf/repair-archetypes`) — versioned, typed archetype registry mapping `(diagnosisId × framework) → EditTemplate`. Ships 3 archetypes in v1 (`lcp.preload-missing`, `lcp.render-blocking-font`, `cls.image-no-dimensions`) for 2 frameworks (Next.js, plain-html). Bundle ≤50KB gz.
- **`packages/worktree-manager/`** (NEW, `@ohmyperf/worktree-manager`) — thin (~150 LOC) safety-hardened wrapper around `git worktree add/remove`. Owns the `/tmp/ohmyperf-verify-<uuid>` lifecycle, atexit + janitor cleanup, and path-traversal validation for patch application.
- **`packages/patch-applier/`** (NEW, `@ohmyperf/patch-applier`) — normalizes the 3 supported patch inputs (JSON Patch / unified diff / worktreePath) into a canonical `CanonicalPatch` form. Applies edits with `oldSha` verification (refuses dirty applies).

### Modified

- **`apps/mcp-server/`** — register 4 new MCP tools: `verify_fix`, `propose_fix`, `list_archetypes`, `get_archetype`. Each is a thin zod-schema wrapper that delegates to `@ohmyperf/agent-loop`. New MCP resources: `ohmyperf://archetypes/<id>@<version>`, `ohmyperf://verify-results/<id>`.
- **`apps/cli/`** — new sub-commands `ohmyperf verify --patch=<path> --baseline=<reportId>` and `ohmyperf propose --report=<reportId> --diagnosis=<id>`. CLI is the human-facing path; MCP is the agent path. Both call the same `@ohmyperf/agent-loop` library.
- **`packages/core/src/types.ts`** — add `VerifyResult` type (schema-versioned, frozen at v1.0.0). No changes to `Report` (verify is sibling, not mutation).
- **`tests/agent-fix-loop-corpus/`** (NEW directory) — 10 fixture pages, each with KNOWN broken state + KNOWN canonical fix + recorded baseline Report. Used as integration acceptance.

### Added — adrs

- **`openspec/adrs/000X-archetype-versioning.md`** — archetype-as-data (not plugin) decision, governance rules (new archetype = ADR + tests + canonical fixture), versioning scheme (`<archetypeId>@<semver>`).
- **`openspec/adrs/000Y-worktree-safety-model.md`** — patch path validation, refusal list (`.git/`, `.env*`, `node_modules/`, symlinks), atexit + janitor design.

## Dependencies on prior in-flight tracks

This change has **hard dependencies** on three earlier OpenSpec changes in the v2 series. Each dependency MUST be either merged or in code-complete state with stable public APIs before Track E ships:

| Dep | What this track needs from it | Risk if drifts |
|---|---|---|
| **#1 SPRT + provenance** (likely shipped as part of `add-metric-accuracy` extension OR a future `add-statistical-runner` proposal) | `runSPRT()` runner + `ProvenanceFingerprint` env hash | Verify cannot produce a statistically-valid verdict. **Blocker.** |
| **#2 Diagnosis taxonomy + source-maps** (likely the diagnosis layer in `add-diagnostic-insights`) | Stable `TaxonomyId` enum + `Diagnosis.evidence` typed shape per ID | Archetype keying breaks; predictor functions cannot read evidence. **Blocker.** |
| **#4 reproduce.ts + reproducer store** (likely a future `add-reproducible-runs` proposal) | `reproducerRef` embedded in every Report + `loadReproducer(reportId)` + `runReproducer(reproducer, runs)` API | Verify cannot replay baseline conditions; CI95 deltas meaningless. **Blocker.** |

**Verification gap to close before coding** (flagged by Oracle's architecture review): the prior 4 changes referenced by name in this proposal's working title (#1/#2/#4) are **not yet present in `openspec/changes/`** as standalone proposals — they may be subsumed inside `add-metric-accuracy` / `add-diagnostic-insights`, OR they may still be pending proposals in the v2 pipeline. Before Track E moves from PROPOSED to ACCEPTED, the project lead MUST confirm: (a) which existing change provides each dependency, and (b) the exported API surface is locked. If any dependency is still in design, Track E waits.

## Scope

### In v1 (MVA — ships in ~2 weeks of focused work)

- `verify_fix` with `apply: 'worktree'` mode only (safe; never mutates user's working directory).
- JSON Patch input only (canonical machine-generated format).
- `propose_fix` for 2 frameworks: **Next.js** (`next` in dependencies) and **plain-html** (fallback).
- 3 archetypes:
  - `lcp.preload-missing` (× Next.js + plain-html)
  - `lcp.render-blocking-font` (× Next.js + plain-html)
  - `cls.image-no-dimensions` (× Next.js + plain-html)
- Single-worktree serialization (per-baseline mutex); no concurrent verify on same baseline.
- Static archetype registry (typed TS exports); no hot-reload, no third-party archetypes.
- SPRT-based verdict with Holm–Bonferroni multi-metric correction.
- Side-effect detection via re-running the full diagnosis pass on post-Report.
- Idempotency: `verifyKey` cache, deterministic `proposalId`.
- Acceptance: agent loop reaches `improvement` verdict within 3 propose→verify iterations on ≥8/10 corpus fixtures.

### Explicitly deferred to v1.1 / v2

- **`apply: 'in-place'` mode** — mutating the user's working dir requires a clean-git-tree gate, interactive confirmation, atomic rollback on regression — non-trivial UX. v1.1.
- **Unified-diff and worktreePath patch inputs** — JSON Patch covers the agent path; the other two are human-convenience. v1.1.
- **More frameworks** — Remix, Astro, Vite, SvelteKit. v2.
- **More archetypes** — at least 7 more from the high-frequency diagnoses list (inp.event-handler-too-long, lcp.image-not-lazy, cls.font-swap-shift, etc.). v2.
- **Archetype hot-reload / user archetypes / archetype marketplace** — premature.
- **Worktree caching / prebuilt node_modules tarball** — perf optimization, not correctness. v2 once telemetry guides where it matters.
- **Calibrated predictor functions** — v1 uses simple heuristics; v2 calibrates against telemetry of (predicted vs measured) deltas.
- **AST-aware multi-file refactors** — strict string-replacement edits in v1; AST templates v2.

## Pinned design decisions (from Phase 2 synthesis, 2026-05-19)

- **Archetypes are DATA, not plugins.** A separate `@ohmyperf/repair-archetypes` package exports versioned, typed templates as pure functions `(evidence: Evidence) => Edit[]`. No plugin API in v1. Internal teams can add archetypes via PR + ADR + canonical fixture; users cannot register their own until v2.
- **`verify_fix` and `propose_fix` live in `@ohmyperf/agent-loop`, NOT in `@ohmyperf/mcp-server`.** MCP is one of 4 surfaces (CLI, MCP, website, VSCode ext). Putting logic in MCP forces duplication. mcp-server thin-wraps the library.
- **Worktree-only apply in v1.** Default and only mode. `in-place` deferred per scope note above.
- **One canonical internal patch form.** `CanonicalPatch` with `op: 'replace' | 'add' | 'remove' | 'create'`, `filePath` (repo-relative, validated), optional `oldSha`. All three input formats normalize to this. Single security pass, single apply path, single hash for idempotency.
- **Idempotency keys**: `proposalId = sha256(diagnosisId + reportId + archetypeId + resolvedArchetypeVersion + ohmyperfVersion)` where `resolvedArchetypeVersion` is **pinned at propose time** and stored in the proposal record (so a `verify_fix({ proposal: proposalId })` issued after an archetype upgrade still resolves the original pinned version — guaranteeing reproducibility). `verifyKey = sha256(baselineReportId + canonicalPatch.id + reproducerHash + ohmyperfVersion)`. Cached `VerifyResult` returned on repeat.
- **Verdict thresholds**: `improvement` = SPRT terminates with `p < 0.05` for ≥1 focus metric AND directional match (LCP/FCP/TBT/INP/CLS negative; perfScore positive); `regression` = symmetric (any focus metric significantly worsens); `no-effect` = SPRT terminates inconclusive with `|delta| < noiseFloor` per metric; `inconclusive-noisy` = SPRT exhausts `maxRuns` without termination. Multi-metric uses Holm–Bonferroni step-down (less conservative than plain Bonferroni).
- **Side-effect "new insight"** = a diagnosis whose `taxonomyId` was NOT in baseline AND severity ≥ `medium` AND evidence magnitude > archetype-declared `noiseFloor`. Same taxonomy ID with worse evidence = `regression`, surfaced separately.
- **`predictedDelta` is computed, not static.** Each archetype declares a `predict(evidence, env) → { metric: delta, ci95 }` function. v1 uses simple heuristics (e.g. `removedBytes / effectiveBandwidth`); v2 calibrates from telemetry.
- **`archetypeSourceUrl`** = `ohmyperf://archetypes/<id>@<version>` (MCP resource, canonical) + `https://ohmyperf.dev/archetypes/<id>@<version>` (HTTP, embedded in HTML/MD reports for humans).
- **Security model**: every `filePath` resolved via `path.resolve(repoRoot, filePath)` + assert `startsWith(repoRoot + sep)` + reject `..` segments at parse time. Patches touching the refusal list are REJECTED at validation time. The refusal list covers: VCS internals (`.git/`), ohmyperf internals (`.ohmyperf/`), installed deps (`node_modules/`), env/secrets (`.env*`), cloud cred dirs (`.ssh/`, `.aws/`, `.gnupg/`, `.azure/`, `.gcloud/`), SSH/PGP keys (`id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa`, `.pub` variants), cert/key file extensions (`*.pem`, `*.key`, `*.crt`, `*.pfx`, `*.p12`), cloud config tokens (`wrangler.toml`, `netlify.toml`, `vercel.toml`), IaC state (`terraform.tfstate`, `.backup`), registry credentials (`.npmrc`, `.yarnrc(.yml)?`, `.pypirc`, `.git-credentials`, `.netrc`), and any symlinked parent. Full enumeration in `design.md` §6. Only `op: 'create'` is allowed outside the `git ls-files` tracked allowlist but still within `repoRoot`.
- **Worktree cleanup** = both `process.on('exit'|'SIGINT'|'SIGTERM')` atexit handler AND a janitor sweep on every ohmyperf startup (removes `/tmp/ohmyperf-verify-*` older than 24h, PID-locked dirs preserved if process alive).
- **`engines.node >= 22.0.0`** — consistent with Track A; `pnpm install --frozen-lockfile` per worktree with shared `--store-dir`, with `cp -al` hardlink optimization when lockfile unchanged.

## Success criteria

1. `pnpm test --filter @ohmyperf/agent-loop` green, including statistical correctness tests (SPRT verdict on synthetic delta distributions).
2. `pnpm test --filter @ohmyperf/repair-archetypes` green for all 3 archetypes × 2 frameworks (= 6 archetype variants).
3. **Acceptance corpus**: agent loop reaches `improvement` verdict within 3 propose→verify iterations on **≥8/10** fixtures in `tests/agent-fix-loop-corpus/`.
4. **Idempotency**: same `baselineReportId` + same `CanonicalPatch.id` produces byte-identical `verifyKey` and returns cached `VerifyResult` on re-verify (assertion in test).
5. **Side-effect detection**: the dedicated corpus fixture (`fixtures/lcp-fix-causes-cls-regression/`) where preload-fix introduces font-swap CLS — `newInsights` array MUST contain a `cls.*` diagnosis with severity ≥ medium.
6. **Security**: filePath traversal test suite — every refusal-listed path (`.git/HEAD`, `../../etc/passwd`, symlinked file, `.env`, `node_modules/x/index.js`) MUST be rejected at patch-validation time with a typed error.
7. **Bundle**: `@ohmyperf/repair-archetypes` ≤ 50KB gz (measured by `pnpm size:archetypes` CI gate).
8. Cleanup: after `verify_fix` returns, `ls /tmp/ohmyperf-verify-*` is empty (unless `--keep-worktree` was passed in test mode).

## Risks

- **Dependency-stack drift**: Tracks #1/#2/#4 are still in design or partial-merge. If their APIs change after Track E starts, rework is non-trivial. **Mitigation**: gate Track E start on a written confirmation from each dependency owner that the exported API surface is locked. Track E proposal MUST NOT be moved to ACCEPTED until this confirmation is recorded in `tasks.md` E0.1.
- **`pnpm install` cost dominates verify wall-clock** (~30s cold, ~5s warm). **Mitigation**: shared `--store-dir=~/.ohmyperf/pnpm-store` + `cp -al` hardlink when lockfile unchanged. Document worst-case wall-clock per verify in README; target ≤90s cold, ≤30s warm for typical Next.js app.
- **Statistical false positives**: SPRT + Holm–Bonferroni may still produce occasional false `improvement` on highly variable focusMetrics. **Mitigation**: per-archetype `noiseFloor` enforces a minimum effect size; verdict logic requires both p<0.05 AND `|delta| > noiseFloor`.
- **Archetype placeholder filling failures** (Diagnosis.evidence missing fields, schema drift between baseline Report and current ohmyperf version). **Mitigation**: each archetype declares its required evidence shape via zod; `proposeFix` validates evidence before emitting edits. On validation failure, return `{ proposal: null, reason: 'evidence-incomplete', missing: [...] }` — agent retries with a different diagnosis.
- **Turborepo cache poisoning + Next.js `.next/` stale cache**: worktrees may inherit stale build outputs that skew LCP. **Mitigation**: per-framework `prepareWorktree()` hook clears `.next/`, `.turbo/`, `.vite/` before measurement; `TURBO_CACHE_DIR` set to per-worktree path.
- **Node-version drift between verify host and baseline**: a baseline measured on Node 22 verified on Node 20 produces meaningless delta. **Mitigation**: pre-flight check compares `engines.node` from baseline `provenance` with current process; mismatch on major version → fail with clear error, no silent re-measure.
- **Concurrent verify_fix on same baseline**: race on worktree creation + diff in build caches. **Mitigation**: per-`baselineReportId` mutex queue (in `@ohmyperf/agent-loop`); two parallel verifies on the same baseline serialize automatically; different baselines run in parallel up to a max-3 worktree pool (configurable).
- **MCP exposure of worktree contents**: a malicious agent could attempt to read files outside the worktree via crafted patch paths. **Mitigation**: every read/write goes through `worktree-manager.assertInRepoRoot(path)`; symlinks rejected; MCP server binds `127.0.0.1` by default with `OHMYPERF_MCP_TOKEN` env required for any non-loopback exposure.
- **Bundle pressure**: 50KB gz for 6 archetype variants + framework detectors + AST helpers is achievable but tight. **Mitigation**: per-archetype lazy-load via `import()`; ship only the diagnosis-ID → archetype-id registry eagerly (~2KB); pull edit templates on demand. Measured by `pnpm size:archetypes`.

## Self-review fixes applied (2026-05-19)

After Phase 4 review (Momus subagent unavailable; inline critical review applied by orchestrator), the following tightenings were applied to address hard-question gaps:

1. **`ApplyMode` narrowed** to literal `'worktree'` in v1 public surface (`@ohmyperf/agent-loop` exported type + MCP zod schema). Internal type retains the wider union for v1.1 forward-compat. Eliminates the API-smell of exposing a runtime-rejected value.
2. **Taxonomy version pinning**: every `Report.provenance` MUST carry `taxonomyVersion`; `verify_fix`'s `newInsights` filter excludes any diagnosis whose `firstSeenIn` is later than `baseline.provenance.taxonomyVersion`. Prevents falsely attributing newly-detectable diagnoses to the patch under test. New dependency requirement added to Track #2 (`firstSeenIn(taxonomyId)` API) — see E0.1.b.
3. **`proposalId` archetype-version pinning**: `archetypeVersion` is resolved AT PROPOSE TIME and persisted in the proposal record; `verify_fix({ proposal: proposalId })` reads the pinned version, NOT the current one. Archetype upgrades create new proposalIds but do not break reproducibility of pre-existing proposals.
4. **`node_modules` hardlink wording disambiguated**: clarified that the hardlink source is the USER'S REPO ROOT `node_modules` (not "baseline" — baseline was a measurement, not a directory). Invariants enumerated (lockfile match, repoRoot/node_modules exists, patch didn't touch package.json/lockfile). Windows fallback documented.
5. **Refusal list expanded**: added SSH/PGP keys (id_rsa, id_ed25519, etc., `.pub`), cert/key file extensions (`*.pem`, `*.key`, `*.crt`, `*.pfx`, `*.p12`), cloud config tokens (wrangler.toml, netlify.toml, vercel.toml), IaC state (terraform.tfstate), registry credentials (.npmrc, .yarnrc, .pypirc, .git-credentials, .netrc). Spec scenarios cover each category; test harness requires ≥30 reject cases.

Additional integrity tightenings:

6. **`VerifyResult` cache LRU-bounded** (default 256 entries, configurable). Evicted entries still resolvable via report-store by `VerifyResult.id`.
7. **Predicted-vs-measured concordance** (`deltas[m].predicted` + `withinCI`) wired into `verify_fix` when invoked via `proposalId`; undefined for raw-patch invocations.
8. **Baseline reproducer health pre-flight**: a one-shot pre-patch dry-run of the reproducer verifies the baseline is replayable before any patch is applied. Aborts with `reproducer-fault` on failure.

## Non-goals

- Mutating user's working directory in v1 (`in-place` mode deferred).
- Supporting arbitrary patch formats beyond JSON Patch in v1.
- Framework matrix beyond Next.js + plain-html in v1.
- Agent loop orchestration UI (the agent itself orchestrates; ohmyperf provides primitives).
- Archetype marketplace, custom user archetypes.
- AST-aware multi-file refactors.
- Cloud-side verify execution (verify runs locally on user's machine).
- Modifying the Report schema beyond adding the sibling `VerifyResult` type.
