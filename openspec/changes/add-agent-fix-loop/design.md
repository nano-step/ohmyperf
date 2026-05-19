# Design: Agent Fix Loop (Track E)

## 1. Package topology

```
packages/
├── agent-loop/             NEW  @ohmyperf/agent-loop
│   src/
│   ├── index.ts            verifyFix, proposeFix exports
│   ├── verify-fix.ts       SPRT-driven verify loop
│   ├── propose-fix.ts      diagnosis → archetype → edits
│   ├── canonical-patch.ts  3-input normalization
│   ├── verdict.ts          SPRT + Holm-Bonferroni + CI95
│   ├── side-effects.ts     re-diagnosis + new-insight diff
│   ├── idempotency.ts      verifyKey/proposalId hashing
│   └── types.ts            VerifyResult, RepairProposal
│
├── repair-archetypes/      NEW  @ohmyperf/repair-archetypes
│   src/
│   ├── index.ts            registry export + resolve(diagnosis, framework)
│   ├── framework-detect.ts package.json + heuristic + confidence score
│   ├── archetypes/
│   │   ├── lcp.preload-missing/
│   │   │   ├── next.ts     EditTemplate for next.js
│   │   │   ├── plain.ts    EditTemplate for plain-html
│   │   │   ├── predict.ts  predictedDelta function
│   │   │   ├── evidence.ts zod schema for required Evidence
│   │   │   └── fixture/    canonical example (input Report.json + expected edits.json)
│   │   ├── lcp.render-blocking-font/
│   │   └── cls.image-no-dimensions/
│   └── schema.ts           Archetype/EditTemplate types
│
├── worktree-manager/       NEW  @ohmyperf/worktree-manager
│   src/
│   ├── index.ts            create/destroy worktree, apply patch
│   ├── safety.ts           path validation, refusal list, symlink detection
│   ├── janitor.ts          /tmp sweep on startup
│   └── lock.ts             PID-based lock file
│
└── patch-applier/          NEW  @ohmyperf/patch-applier
    src/
    ├── index.ts            apply(canonicalPatch, worktreeRoot)
    ├── json-patch.ts       RFC 6902 → CanonicalPatch
    ├── unified-diff.ts     git apply wrapper (v1.1)
    └── worktree-input.ts   {worktreePath} → CanonicalPatch (v1.1)
```

**Why a new package for `agent-loop` and not adding to `core`?**

- `core` is the measurement engine; it must not depend on `simple-git` or know about patch formats.
- `agent-loop` is a *consumer* of core (`runReproducer`, `runSPRT`) — separating it keeps `core`'s dep graph clean.
- All 4 surfaces (CLI, MCP, website, VSCode ext) call into `agent-loop` directly; if it lived in `mcp-server` we'd duplicate the orchestration logic.

**Why archetypes are a separate package, not plugins?**

- Plugin lifecycle (register at runtime, attach hooks) is wrong for archetypes — they're versioned content, not executable extensions.
- Archetype governance (ADR per archetype, canonical fixture, predictor) is fundamentally different from metrics/audit plugins.
- A separate package keeps the plugin API stable (no premature exposure of `registerArchetype`).
- v2 may add a thin `registerArchetype()` hook for internal teams; user-facing extensibility deferred.

## 2. Data flow

### propose_fix

```
Agent calls MCP propose_fix({reportId, diagnosisId})
   │
   ▼
agent-loop.proposeFix(reportId, diagnosisId)
   │
   ├─ load Report by reportId  (existing core Report-store)
   │
   ├─ extract Diagnosis from Report.diagnoses[] where d.id === diagnosisId
   │      (taxonomy enum from Track #2 — Diagnosis.taxonomyId, evidence: typed)
   │
   ├─ framework = repair-archetypes.detectFramework(repoRoot)
   │      → { framework, confidence }
   │      → if confidence < 0.7  framework := 'plain-html'
   │
   ├─ archetype = repair-archetypes.resolve(diagnosis.taxonomyId, framework)
   │      → if missing: return { proposal: null, reason: 'no-archetype' }
   │
   ├─ validate diagnosis.evidence against archetype.evidenceSchema (zod)
   │      → if fails: return { proposal: null, reason: 'evidence-incomplete', missing }
   │
   ├─ edits = archetype.template(diagnosis.evidence)   // pure function
   │
   ├─ predictedDelta = archetype.predict(diagnosis.evidence, env)
   │
   ├─ resolvedArchetypeVersion = archetype.version  // PIN at propose time
   ├─ proposalId = sha256(diagnosisId + reportId + archetypeId + resolvedArchetypeVersion + ohmyperfVersion)
   │
   ├─ persist RepairProposal record keyed by proposalId
   │      (so a later verify_fix({proposalId}) can resolve the pinned archetypeVersion)
   │
   └─ return RepairProposal {
        proposalId, archetypeId, archetypeVersion: resolvedArchetypeVersion,
        diagnosis, framework, edits[], predictedDelta,
        verifyCommand: 'ohmyperf verify --proposal=<id>',
        archetypeSourceUrl: 'ohmyperf://archetypes/<id>@<resolvedArchetypeVersion>'
      }
```

### verify_fix

```
Agent (or human via CLI) calls verify_fix({baselineReportId, patch, runs?, focusMetrics?, apply})
   │
   ▼
agent-loop.verifyFix(args)
   │
   ├─ acquire mutex on baselineReportId  (per-baseline serialization)
   │
   ├─ load baselineReport, reproducerRef (from Track #4 store)
   │      → if reproducer missing: throw 'baseline lacks reproducer'
   │
   ├─ canonicalPatch = patch-applier.normalize(patch)
   │      → JSONPatch | unifiedDiff | worktreePath all → CanonicalPatch
   │      → patchId = sha256(canonicalEditsJSON)
   │
   ├─ verifyKey = sha256(baselineReportId + patchId + reproducerHash + ohmyperfVersion)
   │
   ├─ if cache.has(verifyKey)  return cache.get(verifyKey)   // idempotency
   │
   ├─ pre-flight checks:
   │      - canonicalPatch.edits every filePath ∈ repoRoot (assertInRepoRoot)
   │      - no .git/, .env*, node_modules/, symlinks, etc.
   │      - Node major version of baseline.provenance matches current process
   │      - disk free > 2GB
   │
   ├─ create worktree: worktree-manager.create(repoRoot, baselineRef)
   │      → /tmp/ohmyperf-verify-<uuid>
   │      → PID lock file written
   │      → atexit handler registered
   │
   ├─ apply patch in worktree: patch-applier.apply(canonicalPatch, worktreeRoot)
   │      → oldSha verification per edit (refuse if file moved/changed)
   │      → atomic: all-or-nothing
   │
   ├─ prepareWorktree (framework-specific hook):
   │      - hardlink node_modules: cp -al <repoRoot>/node_modules <worktree>/node_modules
   │            (only if worktree pnpm-lock matches repoRoot pnpm-lock AND
   │             repoRoot/node_modules exists AND patch did not touch package.json/lockfile)
   │      - else pnpm install --frozen-lockfile --store-dir=~/.ohmyperf/pnpm-store
   │      - clear .next/.turbo/.vite caches
   │      - set TURBO_CACHE_DIR=<worktree>/.turbo
   │
   ├─ run SPRT loop:
   │      runs := []
   │      while runs.length < maxRuns:
   │          post = core.runReproducer(reproducerRef, worktreeRoot)
   │          runs.push(post)
   │          deltas = computeDeltas(baselineRuns, runs, focusMetrics)
   │          sprt = runSPRT(deltas, alpha=0.05/k_Holm, ...)
   │          if sprt.terminate: break
   │
   ├─ for each focusMetric: per-metric verdict
   │      - p<0.05 + directional + |delta|>noiseFloor  → 'improvement' contribution
   │      - p<0.05 + counter-directional               → 'regression' contribution
   │      - sprt terminated, |delta|<noiseFloor        → 'no-effect' contribution
   │      - sprt did not terminate                     → 'inconclusive-noisy'
   │
   ├─ overall verdict aggregation (Holm-Bonferroni step-down):
   │      - any 'regression' → 'regression'
   │      - else any 'improvement' AND no 'regression' → 'improvement'
   │      - all 'no-effect' → 'no-effect'
   │      - else → 'inconclusive-noisy'
   │
   ├─ post-Report = aggregateRuns(runs)  // build a fresh Report from post runs
   │      → store with new reportId  → postReportId
   │
   ├─ side-effect detection:
   │      diagnose(postReport) → postDiagnoses[]
   │      newInsights = postDiagnoses where:
   │         taxonomyId ∉ baselineReport.diagnoses[].taxonomyId
   │         AND severity ≥ medium
   │         AND evidence-magnitude > archetype.noiseFloor[taxonomyId.metric]
   │
   ├─ deltas with CI95 (Mann-Whitney U per metric on baselineRuns vs runs)
   │
   ├─ assemble VerifyResult { id, baselineReportId, postReportId, patchHash:patchId,
   │      reproducerHash, deltas, verdict, newInsights[], runs:runs.length, sprtTrace,
   │      duration, createdAt }
   │
   ├─ store VerifyResult via core report-store API
   │
   ├─ cleanup: worktree-manager.destroy(worktree, { keep: --keep-worktree })
   │      → git worktree remove --force + rm -rf /tmp/ohmyperf-verify-<uuid>
   │      → atexit handler deregistered
   │
   ├─ cache.set(verifyKey, VerifyResult)
   │
   ├─ release baseline mutex
   │
   └─ return VerifyResult
```

## 3. Key types

```ts
// @ohmyperf/agent-loop/types.ts

// v1 public surface: `apply` is a literal narrowed to 'worktree' only.
// v1.1 will broaden the union to include 'in-place' when that work lands.
// Rationale: avoid exposing a surface-area value that is always rejected at
// runtime — leak-free API hygiene.
export type ApplyMode = 'worktree';

// Internal type for v1.1 forward-compat (NOT exported from package):
type ApplyModeInternal = 'worktree' | 'in-place';

export type Patch =
  | { kind: 'jsonPatch'; ops: JSONPatchOp[] }
  | { kind: 'unifiedDiff'; diff: string }      // v1.1
  | { kind: 'worktreePath'; path: string };    // v1.1

export type FocusMetric = 'lcp' | 'inp' | 'cls' | 'tbt' | 'fcp' | 'ttfb';

export type Verdict = 'improvement' | 'regression' | 'no-effect' | 'inconclusive-noisy';

export type VerifyArgs = {
  baselineReportId: string;
  patch: Patch;
  runs?: number;                  // hint; SPRT may use fewer
  focusMetrics?: FocusMetric[];   // default: all CWV
  apply: ApplyMode;
};

export type MetricDelta = {
  measured: number;               // ms (or unitless for CLS)
  predicted?: number;
  withinCI: boolean;
  ci95: [number, number];
  p: number;                      // post-Holm-Bonferroni adjusted
};

export type Diagnosis = {
  id: string;
  taxonomyId: string;             // from Track #2 enum
  severity: 'low' | 'medium' | 'high';
  evidence: Record<string, unknown>;
};

export type VerifyResult = {
  schemaVersion: '1.0.0';
  id: string;
  baselineReportId: string;
  postReportId: string;
  patchHash: string;
  reproducerHash: string;
  deltas: Partial<Record<FocusMetric, MetricDelta>>;
  verdict: Verdict;
  newInsights: Diagnosis[];
  regressedInsights: Diagnosis[];  // same taxonomyId, worse evidence
  runs: number;
  sprtTrace: SprtTraceEntry[];
  duration: number;
  createdAt: string;
};

export type ProposeArgs = {
  reportId: string;
  diagnosisId: string;
};

export type Edit = {
  type: 'edit' | 'create' | 'delete';
  filePath: string;                // repo-relative, validated
  oldString?: string;
  newString?: string;
  rationale: string;
};

export type RepairProposal =
  | {
      proposalId: string;
      archetypeId: string;        // e.g. 'lcp.preload-missing'
      archetypeVersion: string;   // PINNED at propose time, survives archetype upgrades
      diagnosis: Diagnosis;
      framework: Framework;
      edits: Edit[];
      predictedDelta: Partial<Record<FocusMetric, { delta: number; ci95: [number, number] }>>;
      verifyCommand: string;
      archetypeSourceUrl: string;  // ohmyperf://archetypes/<archetypeId>@<archetypeVersion>
    }
  | { proposal: null; reason: 'no-archetype' | 'evidence-incomplete' | 'framework-version-skew'; missing?: string[] };
```

```ts
// @ohmyperf/repair-archetypes/schema.ts

export type Framework = 'next.js@14' | 'remix' | 'astro' | 'vite' | 'plain-html';

export type Archetype = {
  id: string;                                                       // e.g. 'lcp.preload-missing'
  version: string;                                                  // semver
  diagnosisId: string;                                              // matches Track #2 taxonomyId
  framework: Framework;
  evidenceSchema: ZodSchema;                                        // validates Diagnosis.evidence
  template: (evidence: any) => Edit[];                              // pure function
  predict: (evidence: any, env: EnvFingerprint) => PredictedDelta;
  noiseFloor: Partial<Record<FocusMetric, number>>;                 // min effect size
  canonicalFixture: string;                                         // path to test fixture
};

export type DetectedFramework = {
  framework: Framework;
  confidence: number;     // 0..1; <0.7 → fallback to plain-html
  signals: string[];      // e.g. ['package.json#next@14.2.5', 'app/layout.tsx exists']
};
```

```ts
// @ohmyperf/patch-applier
export type CanonicalPatch = {
  id: string;                          // content hash
  edits: CanonicalEdit[];
  origin: 'jsonPatch' | 'unifiedDiff' | 'worktree';
};

export type CanonicalEdit = {
  op: 'replace' | 'add' | 'remove' | 'create';
  filePath: string;                    // repo-relative, validated
  oldSha?: string;                     // for safety check
  newContent?: string;
};
```

## 4. Statistical model

### Per-metric SPRT (depends on Track #1)

For each `focusMetric m`:

- Hypothesis pair:
  - H0: `delta(m) = 0` (no effect)
  - H1: `|delta(m)| ≥ noiseFloor(m)` (clinically meaningful effect)
- Sequential test: after each post-run, compute `Mann-Whitney U`(baselineRuns[m], postRuns[m]) → produce p-value.
- Accept H1 if `p < α'` where `α' = 0.05 / k_Holm` (Holm step-down for k = |focusMetrics| simultaneous tests).
- Accept H0 if `|median(post[m]) - median(baseline[m])| < noiseFloor(m)` AND `p > 0.5`.
- Otherwise continue, until `runs.length >= maxRuns` (default 30).

### Why Holm-Bonferroni not plain Bonferroni

Plain Bonferroni at `α/k` is conservative — at `k=6` focus metrics it's `α' = 0.0083`, which inflates required sample size. Holm step-down: sort p-values ascending, compare smallest to `α/k`, next to `α/(k-1)`, etc. Same family-wise error rate, more power.

### CI95 via Mann-Whitney U + Hodges-Lehmann estimator

Per metric, the 95% CI on the delta is computed via the Hodges-Lehmann estimator (median of all pairwise differences) with bootstrap percentile CI95 (B=1000). This is robust to outliers — important because perf data is heavy-tailed.

### `noiseFloor` per metric — initial defaults

| Metric | noiseFloor |
|---|---|
| LCP | 50 ms |
| FCP | 30 ms |
| TBT | 50 ms |
| INP | 16 ms (1 frame at 60Hz) |
| CLS | 0.01 |
| TTFB | 20 ms |

These are minimums for v1; archetypes may declare higher floors for their specific intervention magnitude. Calibrated against the corpus + production telemetry in v2.

## 5. Framework detection

Algorithm in `repair-archetypes.detectFramework(repoRoot)`:

1. Read `package.json` from `repoRoot`. If missing → `{ framework: 'plain-html', confidence: 1.0, signals: ['no-package-json'] }`.
2. Check `dependencies` + `devDependencies` for marker packages:
   - `next` (≥ 13) → candidate `next.js@14` (track major from version range), +0.6 confidence
   - `@remix-run/react` → candidate `remix`, +0.6
   - `@astrojs/core` → candidate `astro`, +0.6
   - `vite` (without next/remix/astro) → candidate `vite`, +0.5
3. File-path heuristics:
   - `app/layout.tsx` or `app/page.tsx` → +0.2 toward `next.js@14`
   - `app/root.tsx` → +0.2 toward `remix`
   - `astro.config.*` → +0.3 toward `astro`
   - `vite.config.*` → +0.2 toward `vite`
4. If top candidate confidence ≥ 0.7 → return it; else return `plain-html` with the original signals attached.
5. Cache the result per `repoRoot` for the lifetime of the process.

**Confidence ≥ 0.7 threshold rationale**: false-positive framework choice produces broken edits (e.g. applying Next.js preload pattern in a non-Next.js repo would fail or worse, work but be wrong). Falling back to `plain-html` (which emits a generic `<link rel="preload">` in `<head>`) is universally safer.

## 6. Security model

### Patch path validation (mandatory, in `worktree-manager.safety`)

```ts
function assertInRepoRoot(filePath: string, repoRoot: string): asserts filePath {
  // 1. Reject path traversal at parse time
  if (filePath.includes('..')) throw new Error('path traversal');
  if (path.isAbsolute(filePath)) throw new Error('absolute path forbidden');

  // 2. Resolve and verify within repoRoot
  const resolved = path.resolve(repoRoot, filePath);
  if (!resolved.startsWith(repoRoot + path.sep)) throw new Error('outside repoRoot');

  // 3. Reject refusal list
  // Categories: VCS internals · ohmyperf internals · dep installs · env/secrets · cloud creds ·
  //             SSH/PGP keys · cloud config tokens · IaC state · npm/registry tokens
  const refusal = [
    /^\.git\//,                         // git internals
    /^\.ohmyperf\//,                    // ohmyperf internals
    /^node_modules\//,                  // installed deps
    /(^|\/)\.env(\.|$)/,                // .env, .env.local, .env.production, ...
    /^\.ssh\//, /^\.aws\//, /^\.gnupg\//, /^\.azure\//, /^\.gcloud\//,
    /(^|\/)(id_rsa|id_ed25519|id_ecdsa|id_dsa)(\.pub)?$/,
    /(^|\/).*\.(pem|key|crt|pfx|p12)$/, // certs/keys
    /(^|\/)(wrangler|netlify|vercel)\.toml$/,  // cloud cfg with API tokens
    /(^|\/)terraform\.tfstate(\.backup)?$/,    // IaC state often contains secrets
    /(^|\/)\.npmrc$/, /(^|\/)\.yarnrc(\.yml)?$/, /(^|\/)\.pypirc$/,
    /(^|\/)\.git-credentials$/, /(^|\/)\.netrc$/,
  ];
  if (refusal.some(re => re.test(filePath))) throw new Error('refusal list');

  // 4. Symlink check: walk parents, lstat each, reject if any is a symlink
  let cursor = path.dirname(resolved);
  while (cursor !== repoRoot) {
    const stat = await fs.lstat(cursor).catch(() => null);
    if (stat?.isSymbolicLink()) throw new Error('symlinked parent');
    cursor = path.dirname(cursor);
  }
}
```

### MCP exposure

- Default: `mcp-server` binds `127.0.0.1` only.
- `OHMYPERF_MCP_TOKEN` env var required for any non-loopback exposure (bearer-token over the transport).
- Tool args size capped at 256KB; large patches must use `worktreePath` input mode (v1.1).
- `verify_fix` and `propose_fix` rate-limited per-process (max 3 concurrent, max 100/hour) to prevent runaway agent loops from filling disk.

### Disk quotas

- Refuse `verify_fix` if `df -h /tmp` shows < 2GB free.
- Max 3 concurrent worktrees per process (configurable via `OHMYPERF_VERIFY_MAX_CONCURRENT`).
- Janitor sweeps `/tmp/ohmyperf-verify-*` older than 24h on every CLI/MCP startup; PID-locked dirs preserved if process alive.

### In-place mode (v1.1 design, NOT shipped in v1)

When eventually implemented:
- Requires `--apply=in-place` AND `--confirm` flag explicitly.
- Pre-flight: `git status --porcelain` must be empty (clean tree).
- Pre-flight: interactive TTY confirmation (no piped/scripted invocation).
- Atomic rollback: stash changes, apply patch on top of stash base, on regression `git restore .` to baseline.
- Never accept `in-place` over MCP — CLI-only path.

## 7. Worktree lifecycle

```
create(repoRoot, baselineRef) {
   uuid = nanoid(16)
   path = /tmp/ohmyperf-verify-${uuid}
   exec: git worktree add --detach ${path} ${baselineRef}
   chmod 0700 ${path}
   write ${path}/.ohmyperf-lock { pid: process.pid, createdAt: now }
   register atexit(destroy)
   return { path, uuid, lockFile, baselineRef }
}

destroy(worktree, { keep }) {
   if (keep) {
      log: 'kept at ${path}, remove with: git worktree remove --force ${path}'
      return
   }
   try: exec: git worktree remove --force ${path}
   catch: log + fallback: rm -rf ${path}
   ensure: remove from atexit registry
}

janitor() {  // called on every CLI/MCP startup
   for each /tmp/ohmyperf-verify-*:
      stat .ohmyperf-lock
      if missing OR (now - createdAt > 24h):
         try git worktree remove --force; rm -rf
      else:
         pid = lockFile.pid
         if process.kill(pid, 0) throws ESRCH:
            // pid no longer alive
            try git worktree remove --force; rm -rf
}
```

## 8. Acceptance corpus design

Each fixture in `tests/agent-fix-loop-corpus/<name>/` contains:
- `app/` — broken state (the page-under-test)
- `package.json` — declares framework
- `baseline.report.json` — pre-recorded baseline Report (with diagnoses, evidence, reproducer embedded)
- `canonical-fix.json` — JSON Patch representing the known-correct fix
- `expected-verdict.json` — expected verdict + delta range (`{ verdict: 'improvement', deltas: { lcp: { min: -200, max: -500 } } }`)
- `README.md` — what's broken + what the fix does + citation

Initial 10 fixtures:

1. `lcp-preload-missing-next/` — Next.js app, hero `<img>` not preloaded → preload via `metadata.other.preload` in app/layout.tsx
2. `lcp-preload-missing-plain/` — plain HTML, hero img → `<link rel="preload">` in `<head>`
3. `lcp-render-blocking-font-next/` — Google Fonts via `<link>` blocking render → `next/font` swap
4. `lcp-render-blocking-font-plain/` — webfont CSS blocking → `<link rel="preload" as="font">` + `font-display: swap`
5. `cls-image-no-dimensions-next/` — image without `width`/`height` → add `next/image` with explicit dims
6. `cls-image-no-dimensions-plain/` — `<img>` without `width`/`height` → add attrs
7. `lcp-fix-causes-cls-regression/` — preload fix introduces font-swap CLS → SIDE-EFFECT FIXTURE (newInsights must include `cls.font-swap-shift`)
8. `no-archetype-available/` — diagnosis present (e.g. `js.unused-export`) with no v1 archetype → `proposal.null` with `reason: 'no-archetype'`
9. `evidence-incomplete/` — diagnosis with missing fields → `proposal.null` with `reason: 'evidence-incomplete'`
10. `inconclusive-noisy/` — fixture where measurement noise > effect size → verdict `inconclusive-noisy`

Acceptance: agent loop reaches `improvement` verdict within 3 propose→verify iterations on **≥8/10**. The 2 fixtures expected NOT to reach improvement (`no-archetype-available`, `inconclusive-noisy`, plus possibly `evidence-incomplete`) test the failure-mode handling.

## 9. Risks & mitigations (additional, beyond proposal.md)

### Risk: bundle size pressure (50KB gz hard limit)

Six archetype variants (3 archetypes × 2 frameworks) + 5 framework detectors + JSON Patch lib + zod schemas could exceed 50KB raw. **Mitigation**:
- Lazy-load each archetype via `import('./archetypes/lcp.preload-missing/next.js')`.
- Eager export only the small registry index (id → import-path map). Estimated 2KB.
- zod is heavy (~12KB gz); evaluate `superstruct` (4KB) or hand-rolled validators if zod pushes over the limit.
- CI gate `pnpm size:archetypes` fails the build if `dist/index.js + dist/registry.json` > 8KB gz (the always-loaded eager portion). Per-archetype chunks measured separately, sum ≤ 50KB total.

### Risk: framework version skew

Next.js 13 vs 14 vs 15 differ in conventions (app/ vs pages/, metadata vs Head, etc.). **Mitigation**: archetype `framework` field encodes major (`next.js@14`); detection includes major. Mismatch (baseline measured on `next@13`, current verify on `next@15`) flagged at proposal time, archetype declines and returns `reason: 'framework-version-skew'`. Per-major templates added incrementally.

### Risk: JSON Patch can't express new file creation idiomatically

RFC 6902 `add` to a non-existent JSON path creates it, but the document is a JSON document — not a filesystem. **Mitigation**: ohmyperf convention — JSON Patch ops use path `/files/<relative/path>` with `value` as file contents. `patch-applier.normalize` maps this to `CanonicalEdit { op: 'create', filePath, newContent: value }`. Documented in the patch schema. Unified diff (v1.1) handles new files natively (`--- /dev/null`).

### Risk: taxonomy version drift between baseline and verify (NEW INSIGHT FALSE POSITIVES)

If Track #2's taxonomy adds a new diagnosis ID (e.g. `js.unused-export`) between when the baseline was recorded and when verify runs, that newly-detectable diagnosis would appear in `postReport.diagnoses[]` but be ABSENT from `baselineReport.diagnoses[]` — falsely classified as a side-effect of the patch when it was actually present all along, just newly-detectable.

**Mitigation** (REQUIRED in v1):
1. Every baseline Report MUST embed `provenance.taxonomyVersion` (delivered by Track #2).
2. `verifyFix` reads `baseline.provenance.taxonomyVersion` and runs the post-Report diagnosis pass against the SAME taxonomy version (Track #2 must support pinning to a historical version).
3. If Track #2 does not yet support version-pinned diagnosis (read-only fallback): `verifyFix` includes `baseline.provenance.taxonomyVersion` and `currentTaxonomyVersion` in `VerifyResult.provenance` and the `newInsights` filter EXCLUDES any diagnosis whose `taxonomyId` was first introduced AFTER `baseline.provenance.taxonomyVersion`. The taxonomy package must expose `firstSeenIn(taxonomyId): string` to support this filter.
4. Side-effect detection scenario: a baseline measured before `cls.font-swap-shift` existed in the taxonomy CANNOT surface it as a newInsight on verify — that would be an artifact of the upgrade, not the patch.

### Risk: reproducer hash sensitivity

Including too many fields → false cache misses (same patch + similar env → cache miss). Too few → false cache hits (different env produces wrong cached verdict). **Mitigation**: `reproducerHash` includes only fields with proven impact on metrics (driver name+version, Chromium revision, hw class: CPU throttle setting, network profile, viewport). Excludes process-id, wall-clock, current working dir, ulimit. Each excluded field justified in an ADR.

### Risk: SPRT corner cases on tiny effect sizes

A delta exactly at the noiseFloor boundary causes SPRT to oscillate. **Mitigation**: explicit indeterminate zone in verdict logic: `noiseFloor * 0.9 < |delta| < noiseFloor * 1.1` → verdict downgraded to `inconclusive-noisy` even if p<0.05. Boundary trade-off accepted: better to ask user for more runs than to commit a misleading verdict.

## 10. Decisions resolved (no open questions for user — autonomous mode)

| Topic | Decision | Rationale |
|---|---|---|
| Concurrent verify on same baseline | Mutex-serialize per baselineReportId | Race on build cache + worktree paths; correctness over throughput |
| Concurrent verify on different baselines | Pool of 3 worktrees max (configurable) | Disk + pnpm-store contention; 3 is empirically safe |
| SPRT inconclusive default | Return `inconclusive-noisy` after `maxRuns` (default 30) | User can re-invoke with higher `runs` if needed; don't loop forever |
| Worktree GC | Both atexit AND 24h janitor | Atexit handles graceful exit, janitor handles SIGKILL/crash |
| `in-place` mode | Cut from v1 | Safety + UX complexity outsized for v1 value; CLI-only in v1.1 |
| Patch input formats v1 | JSON Patch only | Agent path is primary; human/CLI paths v1.1 |
| Archetype source-of-truth | TS files in `repair-archetypes/src/archetypes/<id>/` | Type safety, no template engine, no runtime parsing |
| Framework matrix v1 | Next.js + plain-html | High coverage of agent-fix-loop user base; others v2 |
| Initial archetypes v1 | 3 (lcp.preload-missing, lcp.render-blocking-font, cls.image-no-dimensions) | High-frequency diagnoses with clean canonical fixes |
| Side-effect detection scope | Full diagnosis pass on post-Report, ALL new insights surfaced (not just focusMetrics) | Surfacing only focusMetrics side-effects defeats the purpose; if fixing LCP regresses CLS, user must see it |
| Predictor function calibration | Heuristics in v1, telemetry-calibrated in v2 | Heuristics good enough for direction + order-of-magnitude; calibration needs data we don't have yet |
| MCP exposure | localhost only by default + token for non-loopback | Worktree contains user repo data; default secure |

## 11. Validation strategy

- **Unit tests** (`@ohmyperf/agent-loop`): SPRT verdict on synthetic delta streams; Holm-Bonferroni correction correctness; idempotency hash determinism; CanonicalPatch normalization invariants across the 3 input formats.
- **Unit tests** (`@ohmyperf/repair-archetypes`): each archetype template is a pure function; evidence schema validates known-good and rejects known-bad evidence; predictedDelta within sane bounds; bundle size CI gate.
- **Unit tests** (`@ohmyperf/worktree-manager`): path traversal rejection (every refusal-list entry tested); symlink rejection; janitor correctness (mock filesystem + mock process tree); atexit handler fires.
- **Integration tests** (corpus): for each of 10 fixtures, run the full agent loop (propose → verify) up to 3 iterations; assert verdict matches `expected-verdict.json`; assert `newInsights` matches expected on the side-effect fixture.
- **End-to-end (MCP)**: spawn `mcp-server` as subprocess; client calls `propose_fix` and `verify_fix` via MCP transport; assert canonical responses.
- **Performance budget**: verify wall-clock on the `lcp-preload-missing-next` fixture must be < 90s cold (fresh pnpm-store), < 30s warm. CI runs both modes.
- **Bundle size**: `pnpm size:archetypes` CI gate, fails build if eager portion > 8KB gz or total > 50KB gz.
