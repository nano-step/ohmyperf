# Spec: Agent Fix Loop (verify_fix · propose_fix · archetypes)

## ADDED Requirements

### Requirement: propose_fix returns a typed RepairProposal for known diagnoses

The `proposeFix({ reportId, diagnosisId })` library call (and its MCP `propose_fix` tool wrapper) MUST resolve a `Diagnosis` from the named Report, detect the project's framework, look up the matching archetype, validate the diagnosis evidence, and return a `RepairProposal` with concrete file edits, a predicted-delta with CI95, a deterministic `proposalId`, a `verifyCommand` string, and an `archetypeSourceUrl`.

#### Scenario: Known diagnosis on Next.js produces a Next-flavored proposal

- **GIVEN** a baseline Report whose `diagnoses[]` contains `{ id: "d1", taxonomyId: "lcp.preload-missing", severity: "high", evidence: { lcpResourceUrl: "/hero.jpg", lcpResourceType: "image", lcpElement: "img.hero" } }`
- **AND** the repo's `package.json` contains `"next": "^14.2.0"` and `app/layout.tsx` exists
- **WHEN** the agent calls `propose_fix({ reportId, diagnosisId: "d1" })`
- **THEN** the response `framework` equals `"next.js@14"`
- **AND** `edits` is a non-empty array
- **AND** every `edits[i].filePath` resolves inside the repo root and is NOT in the refusal list
- **AND** `predictedDelta.lcp` exists with `delta < 0` (negative = improvement) and `ci95: [low, high]` with `low ≤ delta ≤ high`
- **AND** the response includes `archetypeId: "lcp.preload-missing"` and `archetypeVersion` (the version PINNED at propose time)
- **AND** `proposalId` matches `sha256("d1" + reportId + "lcp.preload-missing" + archetypeVersion + ohmyperfVersion)` (hex-encoded)
- **AND** the proposal is persisted to the proposal-store keyed by `proposalId` (so a later `verify_fix({ proposal: proposalId })` can resolve the pinned `archetypeVersion`)
- **AND** `verifyCommand` equals `` `ohmyperf verify --proposal=${proposalId}` ``
- **AND** `archetypeSourceUrl` equals `` `ohmyperf://archetypes/lcp.preload-missing@${archetypeVersion}` ``

#### Scenario: Same inputs produce same proposalId across calls (no archetype upgrade)

- **WHEN** `propose_fix` is called twice with the same `reportId` and `diagnosisId` in different processes AND the archetype version has not changed between calls
- **THEN** the returned `proposalId` is byte-identical between calls

#### Scenario: Archetype upgrade between calls produces a new proposalId

- **GIVEN** `propose_fix` returned `proposalId = p1` while archetype version was `1.0.0`
- **AND** the archetype is upgraded to `1.1.0`
- **WHEN** `propose_fix` is called again with the same `reportId` and `diagnosisId`
- **THEN** the new `proposalId = p2 ≠ p1`
- **AND** the proposal-store entry for `p1` still references archetypeVersion `1.0.0`
- **AND** `verify_fix({ proposal: p1 })` resolves and uses the pinned `1.0.0` template (NOT `1.1.0`), guaranteeing reproducibility

#### Scenario: Diagnosis without a v1 archetype returns null with reason

- **GIVEN** a baseline Report whose `diagnoses[]` contains `{ id: "d2", taxonomyId: "js.unused-export", ... }` (a taxonomy ID not present in the v1 archetype registry)
- **WHEN** the agent calls `propose_fix({ reportId, diagnosisId: "d2" })`
- **THEN** the response shape is `{ proposal: null, reason: "no-archetype" }` with no `edits` field

#### Scenario: Incomplete evidence rejects with a typed reason

- **GIVEN** a baseline Report whose `diagnoses[]` contains `{ id: "d3", taxonomyId: "lcp.preload-missing", evidence: { lcpResourceType: "image" } }` (missing `lcpResourceUrl`)
- **WHEN** the agent calls `propose_fix({ reportId, diagnosisId: "d3" })`
- **THEN** the response shape is `{ proposal: null, reason: "evidence-incomplete", missing: ["lcpResourceUrl"] }`

### Requirement: Framework detection falls back to plain-html below confidence 0.7

`detectFramework(repoRoot)` MUST return `{ framework: 'plain-html', confidence: 1.0, signals: [...] }` whenever the highest-scoring framework candidate's confidence is strictly less than `0.7`. The previously computed signals (which packages and files contributed) MUST still be attached for debugging.

#### Scenario: package.json present but no marker package matches

- **GIVEN** a `package.json` containing only `{ "dependencies": { "lodash": "^4" } }` and no framework config files
- **WHEN** `detectFramework(repoRoot)` is called
- **THEN** the result is `{ framework: "plain-html", confidence: 1.0, signals: [...] }`
- **AND** subsequent `propose_fix` calls for `lcp.preload-missing` MUST resolve the `plain-html` archetype, not Next.js

#### Scenario: Ambiguous Vite-only project resolves to vite at ≥0.7

- **GIVEN** `package.json` includes `"vite": "^5"` (no `next`, `@remix-run/*`, `@astrojs/*`) and `vite.config.ts` exists
- **WHEN** `detectFramework(repoRoot)` is called
- **THEN** confidence for `vite` is ≥ 0.7 and the returned framework is `vite`
- **HOWEVER** in v1 no `vite` archetypes are registered, so subsequent `propose_fix` for any diagnosis MUST return `{ proposal: null, reason: "no-archetype" }` rather than silently fall back to plain-html

### Requirement: verify_fix produces a statistically-valid VerifyResult

The `verifyFix({ baselineReportId, patch, runs?, focusMetrics?, apply })` library call (and its MCP wrapper) MUST normalize the patch to a `CanonicalPatch`, apply it in a fresh git worktree, re-measure using the baseline reproducer under SPRT termination, compute per-metric deltas with CI95, classify the verdict, surface side-effect insights, and return a `VerifyResult` with `schemaVersion: "1.0.0"`.

#### Scenario: Worktree-mode verify with measurable improvement returns "improvement"

- **GIVEN** a baseline Report `r0` measured on the `lcp-preload-missing-next` corpus fixture, with `metrics.lcp.value ≈ 3200ms`
- **AND** a JSON Patch applying the canonical preload edit recorded in `canonical-fix.json`
- **WHEN** the agent calls `verify_fix({ baselineReportId: r0, patch, apply: "worktree", focusMetrics: ["lcp"] })`
- **THEN** the response `verdict` equals `"improvement"`
- **AND** `deltas.lcp.measured` is negative
- **AND** `deltas.lcp.p` is < 0.05 (after Holm correction)
- **AND** `|deltas.lcp.measured|` is > the archetype's declared `noiseFloor.lcp` (50ms)
- **AND** `reproducerHash` is non-empty and depends only on (reproducer-bytes, driver-version, chromium-version, hwClass, schemaVersion)
- **AND** `postReportId` is set and resolves to a stored Report whose `metrics.lcp.value` reflects the post-fix measurement
- **AND** `/tmp/ohmyperf-verify-*` is empty after the call returns (no worktree leaked)

#### Scenario: Side-effect fixture surfaces a new CLS diagnosis

- **GIVEN** the corpus fixture `lcp-fix-causes-cls-regression/`, whose canonical preload patch fixes LCP but causes a webfont swap that introduces a CLS shift
- **WHEN** the agent calls `verify_fix` with the canonical patch, `focusMetrics: ["lcp"]`
- **THEN** the response `newInsights[]` contains at least one `Diagnosis` whose `taxonomyId` matches `cls.*` AND severity ≥ `"medium"`
- **AND** `verdict` may be `"improvement"` (LCP did improve) but the new insight is surfaced regardless of focusMetrics

#### Scenario: Inconclusive-noisy verdict when SPRT exhausts runs

- **GIVEN** a corpus fixture where intrinsic measurement noise > the effect size
- **WHEN** the agent calls `verify_fix` with default `runs` (max=30)
- **THEN** the response `verdict` equals `"inconclusive-noisy"`
- **AND** `runs` equals the configured `maxRuns`
- **AND** `sprtTrace` is non-empty and shows non-termination

#### Scenario: Same baseline + same patch returns cached VerifyResult

- **GIVEN** a `verify_fix` call has previously returned a `VerifyResult` with `id = v1` for some `(baselineReportId, patch)`
- **WHEN** the agent calls `verify_fix` with the same `baselineReportId` and a patch whose `CanonicalPatch.id` matches the prior call
- **THEN** the response is byte-identical to the prior `VerifyResult`
- **AND** no new worktree is created (verified by absence of new `/tmp/ohmyperf-verify-*` directories during the call)
- **AND** call duration is < 100ms (cache hit, no measurement)

#### Scenario: Regression verdict when fix worsens a focus metric significantly

- **GIVEN** a baseline Report and a patch that increases LCP by 600ms (intentional regression test)
- **WHEN** the agent calls `verify_fix({ ..., focusMetrics: ["lcp"] })`
- **THEN** the response `verdict` equals `"regression"`
- **AND** `deltas.lcp.measured` is positive
- **AND** `deltas.lcp.p` is < 0.05

#### Scenario: No-effect verdict when delta is below noise floor

- **GIVEN** a baseline Report and a patch that is a no-op (e.g. whitespace-only edit)
- **WHEN** the agent calls `verify_fix({ ..., focusMetrics: ["lcp"] })`
- **THEN** the response `verdict` equals `"no-effect"`
- **AND** `|deltas.lcp.measured|` is < `noiseFloor.lcp` (50ms)
- **AND** SPRT terminated (not `inconclusive-noisy`)

### Requirement: Apply mode is narrowed to 'worktree' in v1

The v1 public TypeScript surface (`ApplyMode` exported from `@ohmyperf/agent-loop`) MUST be the literal `'worktree'`. The MCP tool's zod schema MUST accept only `'worktree'` for the `apply` argument; any other value MUST fail input validation BEFORE entering library code. v1.1 will broaden the union to include `'in-place'` when that work lands.

#### Scenario: in-place mode is rejected at schema validation

- **WHEN** an MCP client calls `verify_fix({ ..., apply: "in-place" })`
- **THEN** the call fails with an MCP `InvalidParams` error before reaching `@ohmyperf/agent-loop` code
- **AND** the error message includes the allowed enum `["worktree"]`

#### Scenario: TypeScript type narrows to 'worktree'

- **GIVEN** a TypeScript consumer imports `ApplyMode` from `@ohmyperf/agent-loop`
- **WHEN** code attempts `const mode: ApplyMode = "in-place"`
- **THEN** TypeScript reports a type error (the literal `'in-place'` is not assignable to `ApplyMode`)

### Requirement: Patch path validation rejects refusal list and traversal attempts

Every `CanonicalEdit.filePath` MUST be validated by `worktree-manager.safety.assertInRepoRoot(filePath, repoRoot)`. The validator MUST reject path-traversal segments (`..`), absolute paths, paths outside `repoRoot`, the configured refusal list (covering VCS internals, ohmyperf internals, dep installs, env/secrets, cloud credentials, SSH/PGP keys, certificate/key file extensions, cloud config tokens, IaC state, npm/yarn/pip/git registry credentials), and any path whose parent chain includes a symbolic link. The full refusal list is enumerated in `design.md` §6 and MUST include at minimum: `.git/`, `.ohmyperf/`, `node_modules/`, `.env*`, `.ssh/`, `.aws/`, `.gnupg/`, `.azure/`, `.gcloud/`, `id_rsa`/`id_ed25519`/`id_ecdsa`/`id_dsa` (and `.pub` variants), `*.pem`/`*.key`/`*.crt`/`*.pfx`/`*.p12`, `wrangler.toml`, `netlify.toml`, `vercel.toml`, `terraform.tfstate`, `.npmrc`, `.yarnrc(.yml)?`, `.pypirc`, `.git-credentials`, `.netrc`.

#### Scenario: Patch touching .git/HEAD is rejected at validation time

- **GIVEN** a JSON Patch attempting to write `{ op: "replace", path: "/files/.git/HEAD", value: "..." }`
- **WHEN** the agent calls `verify_fix` with this patch
- **THEN** the call throws `WorktreeSafetyError { code: "refusal-list", path: ".git/HEAD" }`
- **AND** no worktree is created

#### Scenario: Path-traversal segment is rejected

- **GIVEN** a JSON Patch with `path: "/files/../../etc/passwd"`
- **WHEN** the agent calls `verify_fix`
- **THEN** the call throws `WorktreeSafetyError { code: "path-traversal", path: "../../etc/passwd" }`

#### Scenario: Symlinked parent directory is rejected

- **GIVEN** the repo contains a symlink `src/vendor -> /opt/external` and a patch targets `src/vendor/foo.js`
- **WHEN** the agent calls `verify_fix`
- **THEN** the call throws `WorktreeSafetyError { code: "symlinked-parent", path: "src/vendor/foo.js" }`

#### Scenario: .env files are rejected

- **GIVEN** a patch with `op: "replace", path: "/files/.env.local"`
- **WHEN** the agent calls `verify_fix`
- **THEN** the call throws `WorktreeSafetyError { code: "refusal-list", path: ".env.local" }`

#### Scenario: SSH private key path is rejected

- **GIVEN** a patch targeting `/files/.ssh/id_rsa`
- **WHEN** the agent calls `verify_fix`
- **THEN** the call throws `WorktreeSafetyError { code: "refusal-list", path: ".ssh/id_rsa" }`

#### Scenario: Cloud config tokens are rejected

- **GIVEN** a patch targeting `/files/wrangler.toml` (Cloudflare API tokens) OR `/files/terraform.tfstate`
- **WHEN** the agent calls `verify_fix`
- **THEN** the call throws `WorktreeSafetyError { code: "refusal-list", path: "<the path>" }`

#### Scenario: Certificate and private-key file extensions are rejected

- **GIVEN** a patch targeting `/files/server.pem` OR `/files/cert.key` OR `/files/bundle.pfx`
- **WHEN** the agent calls `verify_fix`
- **THEN** the call throws `WorktreeSafetyError { code: "refusal-list", path: "<the path>" }`

#### Scenario: npm/yarn registry credentials are rejected

- **GIVEN** a patch targeting `/files/.npmrc` OR `/files/.yarnrc.yml`
- **WHEN** the agent calls `verify_fix`
- **THEN** the call throws `WorktreeSafetyError { code: "refusal-list", path: "<the path>" }`

### Requirement: Worktree cleanup is guaranteed on success, failure, and crash

`@ohmyperf/worktree-manager` MUST destroy any worktree it creates upon successful completion. On exception or `SIGINT`/`SIGTERM`, the atexit handler MUST run synchronous cleanup. On hard crash (`SIGKILL`), the janitor sweeping `/tmp/ohmyperf-verify-*` on next ohmyperf startup MUST remove the orphaned worktree, provided its PID-lockfile references a non-alive process.

#### Scenario: Successful verify leaves /tmp clean

- **WHEN** `verify_fix` returns a `VerifyResult` (any verdict) and the caller did NOT pass `--keep-worktree`
- **THEN** `ls /tmp/ohmyperf-verify-*` returns no entries created by this call

#### Scenario: Exception during verify still cleans up worktree

- **GIVEN** a synthetic error is injected during the SPRT loop (e.g. reproducer fails)
- **WHEN** `verify_fix` throws an exception
- **THEN** the worktree directory MUST be removed before the exception propagates to the caller
- **AND** no `/tmp/ohmyperf-verify-*` entries from this call remain

#### Scenario: SIGINT during verify cleans up worktree

- **GIVEN** a long-running `verify_fix` call is in progress
- **WHEN** the process receives `SIGINT`
- **THEN** before exit, the atexit handler removes the active worktree
- **AND** the process exits with a non-zero code

#### Scenario: Janitor reclaims SIGKILL-orphaned worktree

- **GIVEN** a worktree at `/tmp/ohmyperf-verify-abc123/` whose `.ohmyperf-lock.pid` references a process that has been `SIGKILL`-ed
- **WHEN** any ohmyperf CLI or MCP command starts and invokes the janitor sweep
- **THEN** `/tmp/ohmyperf-verify-abc123/` is removed
- **AND** active worktrees (whose lock-PID is alive) are NOT removed

#### Scenario: --keep-worktree retains the directory for inspection

- **GIVEN** the caller passes `--keep-worktree`
- **WHEN** `verify_fix` completes
- **THEN** the worktree directory remains intact at its `/tmp/ohmyperf-verify-<uuid>` path
- **AND** the call result includes a hint string with `git worktree remove --force <path>` command for manual cleanup

### Requirement: Patch idempotency hash is stable across input formats

When the same logical patch is expressed in two different input formats (e.g. JSON Patch and unified diff for the same edits), the normalized `CanonicalPatch.id` MUST be identical after EOL normalization (`\r\n` → `\n`) and deterministic edit ordering (by `filePath` ascending).

#### Scenario: JSON Patch and equivalent unified diff produce same CanonicalPatch.id (v1.1)

- **GIVEN** a JSON Patch and a unified diff that both describe the same set of edits on the same files
- **WHEN** both are normalized via `patch-applier.normalize`
- **THEN** the resulting `CanonicalPatch.id` is byte-identical

(Note: unified-diff input is v1.1; this scenario is the design intent, validated when the v1.1 work lands.)

#### Scenario: Edits in different orders produce same id

- **GIVEN** two JSON Patches `P1` and `P2` containing the same 3 edits in different orders
- **WHEN** both are normalized
- **THEN** `P1.canonical.id === P2.canonical.id`

### Requirement: Holm-Bonferroni multi-metric verdict aggregation

When `focusMetrics` has length k > 1, the verdict logic MUST apply Holm step-down correction with family-wise error rate α = 0.05. Sorted p-values `p_1 ≤ p_2 ≤ ... ≤ p_k` are compared against `α/(k - i + 1)` in ascending order; rejection halts on the first non-significant test.

#### Scenario: Two-metric verify with one significant metric still respects FWER

- **GIVEN** post runs show `lcp.p = 0.02` (LCP improved significantly) and `cls.p = 0.40` (CLS unchanged)
- **WHEN** verdict logic runs with `focusMetrics: ["lcp", "cls"]`
- **THEN** Holm-adjusted `lcp.p` is compared to `0.05/2 = 0.025` and PASSES
- **AND** Holm-adjusted `cls.p` is compared to `0.05/1 = 0.05` and FAILS
- **AND** the overall verdict is `"improvement"` (at least one improved, none regressed)

#### Scenario: Boundary effect downgrades to inconclusive

- **GIVEN** `lcp.measured = -47ms` (just below the `noiseFloor.lcp = 50ms`) and `lcp.p = 0.04`
- **WHEN** verdict logic runs
- **THEN** the verdict is `"inconclusive-noisy"` (in the boundary zone `noiseFloor * 0.9..1.1` regardless of statistical significance)

### Requirement: Bundle-size budget for repair-archetypes

`@ohmyperf/repair-archetypes` MUST satisfy two CI gates:

- Eager bundle (registry index + framework-detect logic, loaded on every import) ≤ **8 KB gz**.
- Total bundle (registry + lazy archetype chunks summed) ≤ **50 KB gz**.

#### Scenario: CI fails when eager bundle exceeds 8 KB gz

- **WHEN** a PR adds dependencies to `repair-archetypes` that push `dist/index.js + dist/registry.json` above 8 KB gz
- **THEN** `pnpm size:archetypes` exits non-zero
- **AND** CI status is `failure` with a message naming the offending bundle and its size

#### Scenario: CI fails when total dist exceeds 50 KB gz

- **WHEN** a PR adds a new archetype variant pushing the summed gz size above 50 KB
- **THEN** `pnpm size:archetypes` exits non-zero with summary
- **AND** the build fails

### Requirement: Concurrency limits and per-baseline serialization

`verify_fix` MUST serialize concurrent calls that share the same `baselineReportId` via an in-process mutex; parallel calls on different baselines MUST share a process-wide pool of at most `OHMYPERF_VERIFY_MAX_CONCURRENT` (default 3) worktrees.

#### Scenario: Two parallel verify_fix calls on same baseline run sequentially

- **GIVEN** two concurrent `verify_fix` calls A and B with the same `baselineReportId` but different patches
- **WHEN** both are invoked at the same instant
- **THEN** B's worktree is created only AFTER A's worktree is destroyed (timestamps prove sequencing)
- **AND** B's `VerifyResult` correctly references the baseline (no state leak from A's modifications)

#### Scenario: Fourth concurrent verify on different baselines waits for a slot

- **GIVEN** three `verify_fix` calls are already running on three distinct baselines
- **WHEN** a fourth call arrives on a fourth distinct baseline
- **THEN** the fourth call blocks until one of the first three completes (or times out per E8.5)

### Requirement: Pre-flight Node major version match

Before creating a worktree, `verify_fix` MUST compare `baseline.provenance.nodeVersion` (major) against the current Node major. Mismatch MUST abort with a typed error before any side effects.

#### Scenario: Baseline measured on Node 22, verify host on Node 20

- **GIVEN** baseline Report's `provenance.nodeVersion` is `"22.5.0"` and `process.versions.node` is `"20.10.0"`
- **WHEN** `verify_fix` is invoked
- **THEN** the call throws `error: "node-version-mismatch", baseline: "22.x", current: "20.x"`
- **AND** no worktree is created
- **AND** no cache entry is written

### Requirement: MCP server bind defaults and token enforcement

The MCP server MUST default to binding `127.0.0.1` only. Exposing on any non-loopback address MUST require `OHMYPERF_MCP_TOKEN` to be set; clients without a valid bearer token MUST be rejected.

#### Scenario: Default startup binds loopback only

- **WHEN** the MCP server is started with no special flags
- **THEN** netstat / equivalent shows it listening only on `127.0.0.1` (or IPv6 loopback)
- **AND** a remote connection attempt fails with `ECONNREFUSED`

#### Scenario: Non-loopback bind without token is refused

- **GIVEN** the user starts the server with `--host 0.0.0.0` and no `OHMYPERF_MCP_TOKEN` env var
- **WHEN** the server initializes
- **THEN** startup fails with `error: "non-loopback-requires-token"` before listening begins

#### Scenario: Non-loopback bind with token requires bearer per request

- **GIVEN** the server is started with `--host 0.0.0.0` and `OHMYPERF_MCP_TOKEN=secret`
- **WHEN** an MCP client connects without the bearer header
- **THEN** the request is rejected with an MCP authorization error
- **AND** the request never reaches `verify_fix` / `propose_fix`

### Requirement: VerifyResult schema is frozen at 1.0.0 and stored independently

`VerifyResult` is a NEW schema-versioned type with `schemaVersion: "1.0.0"` that MUST be stored separately from `Report`. It MUST NOT mutate either the baseline Report or the post Report. The `baselineReportId` and `postReportId` fields reference both Reports by ID.

#### Scenario: VerifyResult.schemaVersion is always "1.0.0"

- **WHEN** any `verify_fix` call returns a `VerifyResult`
- **THEN** `result.schemaVersion === "1.0.0"`

#### Scenario: Reports are not mutated by verify

- **GIVEN** a baseline Report's serialized JSON has SHA `h_pre`
- **WHEN** `verify_fix` is called on this baseline
- **THEN** after the call, the baseline Report's serialized JSON SHA is still `h_pre` (no mutation)
- **AND** the post Report is a NEW Report at a new `postReportId`, not the baseline mutated

### Requirement: list_archetypes and get_archetype MCP tools

The MCP server MUST expose `list_archetypes` (returns the registry index of all archetypes — `{ id, version, framework, diagnosisId }`) and `get_archetype({ id, version? })` (returns full archetype metadata: evidence JSON schema, template description, predicted-delta formula description, canonical fixture link).

#### Scenario: list_archetypes returns all v1 archetypes

- **WHEN** the agent calls `list_archetypes`
- **THEN** the response is an array containing at least 6 entries (3 archetypes × 2 frameworks): `lcp.preload-missing` × `{next.js@14, plain-html}`, `lcp.render-blocking-font` × `{next.js@14, plain-html}`, `cls.image-no-dimensions` × `{next.js@14, plain-html}`

#### Scenario: get_archetype returns evidence schema

- **GIVEN** the agent calls `get_archetype({ id: "lcp.preload-missing" })` (no version → latest)
- **WHEN** the call returns
- **THEN** the response includes `evidenceSchema` (a JSON Schema derived from the zod definition)
- **AND** the response includes `canonicalFixtureUrl` pointing at `tests/agent-fix-loop-corpus/lcp-preload-missing-next/`
- **AND** the response includes `archetypeSourceUrl` equal to `ohmyperf://archetypes/lcp.preload-missing@<version>`

### Requirement: Side-effect detection filters out taxonomy-version artifacts

When `baseline.provenance.taxonomyVersion` differs from the current taxonomy version at verify time, the `newInsights[]` filter MUST exclude any diagnosis whose `taxonomyId` was first introduced AFTER `baseline.provenance.taxonomyVersion`. This prevents falsely attributing newly-detectable diagnoses (added by a taxonomy upgrade) to the patch under test.

#### Scenario: Taxonomy upgrade after baseline does not produce false newInsight

- **GIVEN** a baseline Report whose `provenance.taxonomyVersion = "1.2.0"`
- **AND** the current taxonomy version is `"1.3.0"` which adds new diagnosis ID `js.unused-export` (firstSeenIn = 1.3.0)
- **AND** the post-Report's diagnosis pass reports `js.unused-export` as present
- **WHEN** `verify_fix` computes `newInsights[]`
- **THEN** `js.unused-export` is NOT included in `newInsights[]` (its `firstSeenIn` is later than `baseline.taxonomyVersion`)
- **AND** the resulting `VerifyResult.provenance.taxonomyVersionAtBaseline = "1.2.0"` and `taxonomyVersionAtVerify = "1.3.0"` are surfaced for transparency

#### Scenario: Same-taxonomy diagnosis still counts as newInsight when truly new

- **GIVEN** baseline `taxonomyVersion = "1.3.0"` and current `taxonomyVersion = "1.3.0"` (no upgrade)
- **AND** baseline has NO `cls.font-swap-shift` diagnosis
- **AND** post-Report has `cls.font-swap-shift` (severity = "medium")
- **WHEN** `verify_fix` computes `newInsights[]`
- **THEN** `cls.font-swap-shift` IS included in `newInsights[]`

### Requirement: Acceptance corpus reaches improvement in ≤3 iterations on ≥8/10

The integration test harness `scripts/run-corpus.mjs` MUST iterate through all 10 corpus fixtures, run up to 3 propose→verify cycles per fixture, and pass when at least 8 reach `verdict: "improvement"` (or the documented expected verdict for failure-mode fixtures).

#### Scenario: Default CI run passes corpus

- **WHEN** `pnpm test:corpus` is executed in CI on the v1 implementation
- **THEN** the script exits 0
- **AND** the JUnit XML report shows ≥ 8 fixtures with verdict `"improvement"` and the remaining 2 with their documented expected verdict (one of `"no-archetype"`, `"evidence-incomplete"`, or `"inconclusive-noisy"`)

#### Scenario: Side-effect fixture surfaces CLS new insight

- **WHEN** corpus harness runs the `lcp-fix-causes-cls-regression` fixture
- **THEN** the corresponding `VerifyResult.newInsights[]` contains at least one entry with `taxonomyId` matching `^cls\.` and `severity` in `{ "medium", "high" }`
- **AND** assertion `expect(result.newInsights.some(d => d.taxonomyId.startsWith("cls."))).toBe(true)` PASSES

### Requirement: Disk space and rate-limit pre-flight

Before creating any worktree, `verify_fix` MUST verify (a) free space at `/tmp` ≥ 2 GB and (b) the per-process rate limit (max 3 concurrent verifies, max 100 verifies/hour) is not exceeded. Failure MUST short-circuit with a typed error before any state mutation.

#### Scenario: Insufficient disk space

- **GIVEN** `df -h /tmp` reports `< 2 GB` free
- **WHEN** `verify_fix` is invoked
- **THEN** the call throws `error: "insufficient-disk", free: <bytes>, required: 2147483648` before any worktree is created
- **AND** no mutex is acquired
- **AND** no cache entry is written

#### Scenario: 101st verify in an hour is rejected

- **GIVEN** 100 verify_fix calls have completed within the last 60 minutes for this process
- **WHEN** the 101st call is invoked
- **THEN** the call throws `error: "rate-limit-exceeded", limit: 100, window: "1h"`
- **AND** retries are accepted after the rolling window passes

### Requirement: VerifyResult cache is bounded with documented eviction policy

The in-process `verifyKey → VerifyResult` cache MUST be LRU-bounded with a default maximum of 256 entries (configurable via `OHMYPERF_VERIFY_CACHE_MAX`). When the cache exceeds capacity, the least-recently-used entry MUST be evicted. A `VerifyResult` evicted from cache is NOT lost — it remains available via the report-store API by `VerifyResult.id`; only the fast-path cache lookup is affected.

#### Scenario: Cache evicts LRU entry at capacity

- **GIVEN** `OHMYPERF_VERIFY_CACHE_MAX = 2` and two VerifyResults `v_A`, `v_B` have been cached
- **WHEN** a third verify produces `v_C`
- **THEN** the cache contains exactly `{v_B, v_C}` (assuming `v_A` was least-recently used)
- **AND** subsequent `verify_fix` with `v_A`'s `verifyKey` re-runs the verify (no fast cache hit) but still returns a result equivalent to the original `v_A`

### Requirement: VerifyResult exposes predicted-vs-measured concordance per metric

Each `MetricDelta` in a `VerifyResult` MUST set `withinCI: true` iff the proposal's `predictedDelta[metric].delta` falls within the measured `ci95`. When verify_fix is invoked with a raw patch (no proposal), `predicted` and `withinCI` MUST be undefined for all metrics.

#### Scenario: Predicted delta falls within measured CI95

- **GIVEN** a proposal with `predictedDelta.lcp.delta = -380` and a subsequent verify whose `deltas.lcp.measured = -340` with `ci95 = [-420, -260]`
- **WHEN** the VerifyResult is assembled
- **THEN** `deltas.lcp.predicted === -380`
- **AND** `deltas.lcp.withinCI === true` (since `-420 ≤ -380 ≤ -260`)

#### Scenario: Predicted delta outside measured CI95

- **GIVEN** a proposal with `predictedDelta.lcp.delta = -800` and a verify whose `ci95 = [-420, -260]`
- **WHEN** the VerifyResult is assembled
- **THEN** `deltas.lcp.predicted === -800` and `deltas.lcp.withinCI === false`

#### Scenario: Raw patch (no proposal) leaves predicted undefined

- **WHEN** `verify_fix` is called with a `patch` argument (no `proposal` reference)
- **THEN** for every metric, `deltas[metric].predicted` is `undefined`
- **AND** `deltas[metric].withinCI` is `undefined`

### Requirement: Baseline reproducer health pre-flight

Before running the SPRT loop, `verify_fix` MUST execute the baseline reproducer ONCE on the worktree's pre-patch HEAD to confirm the reproducer is healthy. If this dry-run fails (throws, times out, or produces a Report with `metrics` empty), verify MUST abort with `error: "reproducer-fault"` BEFORE applying the patch.

#### Scenario: Healthy reproducer dry-run passes pre-flight

- **GIVEN** a baseline reproducer that successfully produces a Report when run in a fresh worktree
- **WHEN** `verify_fix` invokes its pre-flight dry-run
- **THEN** the dry-run completes within the configured timeout and pre-flight passes
- **AND** the patch is then applied

#### Scenario: Reproducer fault aborts before patch apply

- **GIVEN** a baseline reproducer that throws on every invocation (e.g. references a now-deleted CDN asset)
- **WHEN** `verify_fix` invokes its pre-flight dry-run
- **THEN** the call throws `error: "reproducer-fault"` BEFORE `patch-applier.apply()` is called
- **AND** the worktree is destroyed during cleanup

### Requirement: archetypeSourceUrl resolves to canonical metadata

The MCP resource `ohmyperf://archetypes/<id>@<version>` returned by `propose_fix` and `get_archetype` MUST resolve to a stable JSON payload containing the archetype's id, version, diagnosisId, framework, evidenceSchema, template description, predictor function description, noiseFloor map, and canonicalFixtureUrl. The same archetype version MUST always resolve to byte-identical content.

#### Scenario: Resource resolution is deterministic across processes

- **WHEN** an MCP client resolves `ohmyperf://archetypes/lcp.preload-missing@1.0.0` in two different ohmyperf processes
- **THEN** the resolved JSON bytes are identical

#### Scenario: Unknown version returns a typed not-found

- **WHEN** an MCP client resolves `ohmyperf://archetypes/lcp.preload-missing@99.9.9`
- **THEN** the resource error is `{ code: "archetype-not-found", id: "lcp.preload-missing", version: "99.9.9" }`
