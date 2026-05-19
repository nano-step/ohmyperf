# Proposal: Hermetic Replay + Reproducer (Track D, OpenSpec #4)

## Why

The "reruns are noisy" complaint plagues every lab-measurement tool. OhMyPerf's calibration + ghost mode + SPRT stack (OpenSpec #1) already reduces system-side variance, but the **biggest remaining noise source is the network** — CDN cache state, origin response time, server-side experiments, even an A/B flip between runs all make σ_live large and conclusions soft. The user can never say "same URL + same machine = byte-identical result" today.

This change kills that complaint at the root: when a user runs in **replay mode**, every request the page makes is fulfilled from a content-addressed cache via CDP `Fetch.fulfillRequest`. No network. No clock skew on the origin. No DNS lookup. The page sees the exact same bytes in the exact same order on every run.

Stacked with #1's ghost mode + SPRT, this gets us as close as physically possible to a deterministic run: only GPU rasterization, JIT warm-up, and OS scheduler jitter remain. Target: **σ_replay < 0.3 × σ_live** for LCP on a fixture page.

The second half is the **reproducer**: every Report now ships next to a generated `reproduce.ts` — a standalone Playwright script pinned to that bundle's content hash. Anyone (CI, a teammate, a user opening a GitHub issue) can re-run the exact measurement against the exact bytes and get the same numbers. This is the foundation for OpenSpec #5's `verify_fix` MCP tool: "I changed the code — does it fix the regression?" becomes a single command that replays the recorded bundle against the candidate build.

## What changes

### Added
- **`packages/replay-cache/` (new package, ≤80 KB gz runtime bundle)** — content-addressed cache, recorder (CDP `Network` listener + parallel `getResponseBody`), player (CDP `Fetch.enable` + `Fetch.fulfillRequest`), HMAC-keyed integrity, `reproduce.ts` codegen. Single package; two `exports` subpaths (`.` for full runtime, `./standalone` for the reproduce.ts loader — strict tree-shake of recorder + codegen so the standalone bundle stays under 30 KB gz).
- **`MeasureOptions.replay` sub-object** on `packages/core/src/types.ts`: `{ mode: 'record' | 'replay'; source?: string; cacheDir?: string; onCacheMiss?: 'fail' | 'allow-live' | 'allow-empty'; redactStorageState?: (state) => state }`. Default behavior (field absent) = live mode, unchanged from today. **No collision with existing `Mode = 'real' | 'ci-stable'`** — replay is orthogonal to calibration mode; you can record in `ci-stable` and replay in `real`.
- **Engine integration in `packages/core/src/engine.ts`** — after `adapter.launchPageWithCdp()` and before `applyEmulation` + `pageCtx.goto`: branch on `opts.replay?.mode`; attach `RecorderHandle` or `PlayerHandle` to `rootSession` + each session in `pageCtx.attachedFrames`. Hook `Target.attachedToTarget` (auto-attach with `waitForDebuggerOnStart: true`) to install Fetch handlers on OOPIFs BEFORE their navigation request fires; release the debugger only after handler is bound.
- **Report meta fields** on `packages/shared-types`: `meta.replayMode?: 'live' | 'record' | 'replay'`, `meta.bundleHash?: string`, `meta.swBypassed?: boolean`, `artifacts.reproduceScriptRef?: string` (relative path to `reproduce.ts`). All optional, additive — schema stays `1.0.0`.
- **Existing `meta.degradations[]` channel reused** for replay-mode warnings (`capability: 'replay-streaming'`, `'replay-plugin-fetch-conflict'`, `'replay-record-overhead'`, etc.). Confirms the unified-surface contract Track A established.
- **CLI flags** in `apps/cli/src/commands/run.ts`: `--record`, `--replay`, `--replay-from <path>`. `--record` and `--replay` are mutually exclusive (error with hint). `--replay-from` accepts a `report.json`, a cache directory (named `<bundle_hash>`), or a `reproduce.ts` — auto-detected by extension → JSON shape → directory shape; ambiguous input rejected with explicit error.
- **MCP tool args** under existing `measure` tool: `replay?: { mode: 'record' | 'replay'; source?: string }`. Same shape as the CLI's resulting MeasureOptions sub-object. MCP `onCacheMiss` defaults to `'fail'` with structured error `{ code: 'REPLAY_CACHE_MISS', missingUrl, hint }`; never prompts.
- **`reproduce.ts` codegen** — template-based (no AST library), emits two files next to `report.json`:
  - `reproduce.ts` — standalone Playwright script. Imports only `@ohmyperf/replay-cache/standalone` (no `@ohmyperf/core` dependency). Embeds calibration constants (CPU throttle factor, network profile name, viewport, UA, headless flag) as plain literals; embeds the relative path to its bundle cache; runs `captureFingerprint()` at start and aborts with a clear error if the on-disk bundle hash + calibration signature ≠ recorded.
  - `reproduce.config.json` — sibling file containing `{ bundleHash, captureFingerprint, calibration, cacheDirRelative }`. Lets non-TS tooling read the metadata without parsing the script.
- **`tests/parity/replay-variance.test.ts`** — validation harness: runs a fixture 20× live, records once, replays 20×; asserts `σ_replay < 0.3 × σ_live` for LCP. Also asserts: two record invocations on the same fixture produce byte-identical `bundleHash` (determinism); 5 `reproduce.ts` invocations produce median LCP within ±30 ms.
- **`packages/share-client/src/redact.ts`** — new exported function `redactStorageState(state, opts)`. Mirrors `redactReport` patterns (env-secret regex, cookie key denylist). NOT a duplicate inside `replay-cache` — the redactor is passed in via `MeasureOptions.replay.redactStorageState`, defaulted by the engine to share-client's export. Keeps `replay-cache` dependency-free.

### Modified
- **`packages/core/src/engine.ts`** — engine.run() gains the replay branch (see Added above). Iterates `pageCtx.attachedFrames` to attach handlers per session. Recorder handles flushed before `pageCtx.close()`; emit `meta.bundleHash` from the flush result. Player verifies manifest HMAC at attach time; refuses to enter replay if signature invalid (fail-fast, no per-entry checks during fulfillment hot path).
- **`packages/core/src/types.ts`** — extend `MeasureOptions` with `replay?` (see Added); extend `ReportMeta` with `replayMode?`, `bundleHash?`, `swBypassed?`; extend `ReportArtifacts` with `reproduceScriptRef?`.
- **`packages/shared-types/src/index.ts`** — mirror the above additions for downstream consumers (viewer, reporters, share-server).
- **`packages/share-client/src/redact.ts`** — extract `redactStorageState` from the existing `redactReport` shared utilities; export it. No new package coupling.
- **`apps/cli/src/commands/run.ts`** — parse the three new flags; translate to `opts.replay` sub-object; reject `--record --replay` combo; map interactive cache-miss prompt → `opts.replay.onCacheMiss` callback.
- **`apps/mcp-server/src/tools/measure.ts`** — surface the new arg; always pass `onCacheMiss: 'fail'` (never interactive); propagate `bundleHash` and `reproduceScriptRef` into the structured response.
- **`scripts/init.ts`** (`apps/cli init` subcommand) — add `.ohmyperf/cache/` to the project's `.gitignore` when initializing, with a comment explaining why (secrets may be in storageState).

### Removed
- Nothing. All changes are additive; existing live-mode behavior is the default when `opts.replay` is absent.

## Out of scope (deferred to v2 / follow-up changes)

- **Service worker honoring** — v1 uniformly bypasses SWs via `Network.setBypassServiceWorker(true)` during record AND replay. Reports flagged `meta.swBypassed: true`. Honoring SWs (SW becomes its own cached entry) is a fidelity loss for SW-heavy apps; defer to v2.
- **Streaming responses** (chunked transfer-encoding, SSE, HTTP/2 Server Push, WebSockets) — v1 unsupported in replay. Recorder logs and adds `meta.degradations[{ capability: 'replay-streaming', detail }]`. Player serves a single best-effort `Fetch.fulfillRequest`; WS/SSE are best-effort no-replay (live connection allowed if `onCacheMiss: 'allow-live'`, otherwise fail).
- **HTTP/3 / QUIC fidelity** — `Fetch.fulfillRequest` is in-process; protocol-level timing (TLS handshake, 0-RTT) is not faithful. Document explicitly. Tools relying on protocol-level timing (e.g. Lighthouse h2/h3 audits) must not use replay mode.
- **Cross-Chromium-major-version replay** — record on Chromium 125 → replay on Chromium 130 may behave differently (CDP method semantics drift). v1 stores `meta.browserVersion` in the bundle manifest and refuses replay on a different major version unless `--allow-version-skew` is passed.
- **Concurrent `Fetch.enable` from plugins** — if any registered plugin needs its own `Fetch.enable` handler (e.g. a future request-mocking plugin), the player refuses to enter replay mode with a clear error listing offending plugins. The multiplexer (chaining player + plugin handlers on the same domain) is v2.
- **Cache GC / LRU eviction** — v1 ships without automatic GC; `.ohmyperf/cache/` grows monotonically. The CLI gets a `ohmyperf cache prune <maxBytes>` subcommand in this change for manual cleanup. Automated GC with size-budget-by-project is a follow-up change.
- **Response bodies > 6 MB** — Chromium's `Fetch.fulfillRequest` has a per-response body size limit (~6 MB on some channels). v1 rejects bundles containing entries above this limit with a clear error at record time; v2 will chunk via `Network.streamResource`-style continuation. Workaround for v1: increase Chromium's flag or skip the offending resource via a recorder filter (future config).
- **Per-resource policy overrides** — users may want to *always* fetch live for analytics endpoints (so production stats aren't polluted). v1 has no allowlist; everything is replayed. Add `MeasureOptions.replay.allowLiveUrlPatterns: string[]` in a follow-up.

## Pinned design decisions (from Phase 2 synthesis, 2026-05-19)

- **Naming: `replay` not `RunMode`.** The user's spec proposed `RunMode = 'live' | 'record' | 'replay'`. Oracle review caught the collision with existing `Mode = 'real' | 'ci-stable'` (`packages/core/src/types.ts:3`). Final shape: `MeasureOptions.replay = { mode: 'record' | 'replay', ... }`, omitted for live. `ReportMeta.replayMode` is a single string field tracking the actual run mode.
- **HMAC self-keying.** Cache entry HMAC key = `bundle_hash`. Tampering a body → body_sha256 changes → bundle_hash changes → HMAC key changes → signature mismatch detected. No out-of-band key material; no per-machine secrets. Threat model is integrity, not authenticity (anyone with the cache can re-sign — that's intended).
- **Bundle hash inputs** (deterministic across machines/OSes): SHA-256 over a sorted list of `(method, url_canonical, content_type, cache_control_directive, body_sha256)`. URL canonicalization: lowercase scheme + host; sort query params; strip cache-buster params via configurable regex (default empty). Body bytes hashed as-received — no line-ending normalization. Header *names* lowercased before sorting; header *values* untouched.
- **Excluded from bundle hash**: `Date`, `X-Request-Id`, `Set-Cookie`, `Last-Modified`, `ETag`, `Server`, `X-Trace-Id`, `CF-Ray`, and any header matching `/^x-.*-(id|trace|debug)$/i`. These vary per request without changing payload semantics. Stored in the cache entry for replay fidelity, just not in the hash.
- **Blob store layout (Git LFS-style)**: `.ohmyperf/cache/<bundle_hash>/manifest.json` lists every URL → entry; entries with body >32 KB are stored as `blobs/<sha256>.gz` (gzip level 6) and referenced by sha256 in the manifest. Bodies ≤32 KB are inlined in the entry. Blob filenames are sha256 only — never URL-derived.
- **POST/PUT/DELETE**: full request body captured; replay rejects with `code: 'REQUEST_BODY_MISMATCH'` if the page issues a request with a different body. JSON bodies are compared after parse + canonical-key-sort to tolerate object-property-order non-determinism; non-JSON bodies compared byte-exact. Document this for users with non-deterministic request payloads.
- **storageState redaction is mandatory by default.** When recording, the engine wraps the captured `storageState` through `redactStorageState` (defaulted from `share-client`) BEFORE disk write. If the user explicitly sets `replay.redactStorageState = (s) => s` (identity) they accept the risk. `.ohmyperf/cache/` is `.gitignore`-d by default. Cache files written mode `0600`.
- **OOPIF auto-attach is Phase 0**, not deferred. The `Target.setAutoAttach({ waitForDebuggerOnStart: true })` + `Runtime.runIfWaitingForDebugger` dance must ship in the MVP because retrofitting it later is a major refactor and OOPIF requests will silently escape replay otherwise. Per-frame Fetch handlers; the bundle manifest tags each entry with `frameId` for diagnostics (not for hash input).
- **Record mode does NOT report perf measurements.** `meta.replayMode === 'record'` records are flagged `meta.degradations[{ capability: 'replay-record-overhead' }]`; the CLI and MCP both warn that record-mode metrics must not be used for performance assertions (10-30% wall-clock overhead from `getResponseBody` RPC round-trips). Validation harness `tests/parity/replay-variance.test.ts` asserts that the record run preceding a replay does NOT influence the measurement (process-level isolation between record + measure phases).
- **Manifest HMAC verified once at attach.** Not per-entry-during-fulfill (would add latency to the hot path). A single tampered entry fails the whole bundle, preserving "the bundle the report measured" invariant.
- **`reproduce.ts` codegen is template strings + JSON, no AST library.** Output is human-readable + diffable. Calibration constants embedded as `const` literals. The script imports from `@ohmyperf/replay-cache/standalone` and `playwright` (peer dep); users running `reproduce.ts` need `pnpm i playwright @ohmyperf/replay-cache` and that's it. **No `pnpm dlx ohmyperf-reproduce` indirection** — direct + readable + greppable.
- **`captureFingerprint` includes**: `sha256(bundleHash + calibrationSignature + viewport.width + viewport.height + userAgent + chromiumMajorVersion + nodeMajorVersion)`. Stored as a constant in `reproduce.ts` AND in `reproduce.config.json`. Recomputed at script start; mismatch aborts with explanation.
- **`packages/replay-cache` budget enforcement**: `tests/bundle-budget.test.ts` asserts the runtime bundle (`dist/index.js` + `dist/standalone.js`) gzipped sizes against fixed caps. Standalone ≤ 30 KB gz, full ≤ 80 KB gz. CI gate on every PR.
- **Schema stays `1.0.0`.** All Report + MeasureOptions changes are additive optional fields. Existing v1.0 reports remain valid when viewed by v1.1+ viewers (already protected by Track A's `?.` chain audit). New v1.1 reports remain readable by v1.0 viewers (they just don't surface the new fields).
- **No new dependencies.** Node built-ins only: `crypto` (SHA-256, HMAC), `zlib` (gzip), `fs/promises`. No `tar`, no `lz4`, no custom binary formats.
- **Git identity**: `nhoxtvt@gmail.com` (personal directory).

## Success criteria

1. `pnpm test --filter @ohmyperf/replay-cache` green: unit tests for bundle-hash determinism (two machines, byte-identical hashes), HMAC sign/verify, gzip blob round-trip, recorder→player full cycle on a static fixture.
2. `pnpm test:parity --filter replay-variance` green: σ_replay < 0.3 × σ_live for LCP on `tests/parity/fixtures/image-heavy-lcp` over 20 trials each.
3. `bundleHash` reproducibility: `pnpm test:replay-hash-cross-machine` runs the recorder against the same fixture on two different CI runners (matrix: ubuntu-22.04, macos-14); bundle hashes byte-identical.
4. `reproduce.ts` reproducibility: harness invokes a generated script 5× and asserts median LCP within ±30 ms across the 5 runs.
5. Every Report from any path (CLI / MCP / extension) generated with `--record` contains `meta.bundleHash`, `meta.replayMode === 'record'`, and `artifacts.reproduceScriptRef` pointing to a file that exists on disk.
6. `packages/replay-cache` bundle budget: `pnpm test --filter @ohmyperf/replay-cache --grep "bundle-budget"` green — standalone ≤ 30 KB gz, full ≤ 80 KB gz.
7. Existing live-mode CLI runs (no flags) produce reports byte-identical to pre-change runs on the same fixture (additive-only contract).
8. Tampering test: a `tests/parity/replay-tamper.test.ts` flips a single byte in a cached body; replay attach fails with `code: 'REPLAY_HMAC_MISMATCH'` and a structured error pointing to the bundle.
9. storageState redaction test: a fixture with `Authorization: Bearer eyJ...` and `Cookie: session=abc...` in network requests produces a cache where, after redaction, no entry contains those substrings. (Validates `redactStorageState` plumbing; the network-layer redaction will be a follow-up, but storageState capture is what this change owns.)

## Risks

- **OOPIF debugger-wait race.** The `Target.setAutoAttach + Runtime.runIfWaitingForDebugger` pattern is timing-sensitive; if Fetch.enable doesn't complete before `runIfWaitingForDebugger`, the first request escapes. Mitigation: synchronous-style sequencing in the player factory; integration test with cross-origin iframe fixture asserting first-request capture. Risk owner: replay-cache player team. Fallback: if the race proves intractable, gate OOPIF replay behind a feature flag with `meta.degradations[{ capability: 'replay-oopif-skipped' }]`.
- **`Network.getResponseBody` failures** (redirects, 204, evicted bodies) cause recorder errors. Mitigation: per-entry try/catch; failed entries logged + omitted from the bundle; recorder emits `meta.degradations[{ capability: 'replay-missing-body', url }]`. Replay-time miss for those URLs falls through to `onCacheMiss` policy. Hard-fail only if the bundle would otherwise be empty.
- **Bundle hash drift across OS** from header-casing or query-param-ordering non-determinism. Mitigation: explicit canonicalization rules + cross-platform test in CI matrix (ubuntu + macos). Risk: if some Chromium release silently re-orders multipart boundaries or compression negotiation, hashes will drift. Caught by the cross-machine determinism test.
- **6 MB `Fetch.fulfillRequest` body cap** on some Chromium channels. Mitigation: record-time validation rejects bundles with oversize entries; error message includes the offending URL and suggests adding it to a (future) allowlist. Caught by `tests/parity/replay-oversize-body.test.ts`.
- **HMAC self-keying is integrity-only, not authenticity.** Documented in user-facing docs: "anyone with the cache can resign it." This is the correct threat model — we're protecting against truncation, corruption, and accidental tampering, not adversarial supply. If a stronger model is needed (e.g. signed bundle distribution), it would use a separate per-publisher keypair; out of scope for v1.
- **Plugin Fetch.enable conflict.** If a future plugin needs concurrent Fetch handling, v1 refuses replay with a clear error. Mitigation: document the policy in `packages/replay-cache/README.md`; design the v2 multiplexer interface now (record only — no spec yet) so when it arrives it doesn't require breaking changes.
- **Recorder CPU overhead may distort the recording.** Mitigation: record runs are flagged with `meta.degradations[{ capability: 'replay-record-overhead' }]` and CLI/MCP both refuse to compare record-mode reports against any baseline. Validation: the parity test re-measures live AFTER recording and asserts no carry-over distortion (process-isolated).
- **Cookies set via Set-Cookie during recording vs storageState's final-state capture** — could double-apply cookies during replay. Mitigation: storageState is the source of truth for cookies at replay start; the recorder strips Set-Cookie from replayed responses unless the recording explicitly tagged them as needed for an intra-page auth flow. Document this corner case; cover with a fixture in `tests/parity/replay-cookie-roundtrip.test.ts`.
- **CDN-served bundles with cache-buster URLs** (`?v=12345`) produce false misses on second-record. Mitigation: configurable `replay.urlCanonicalize.stripQueryRegex` (default empty); users with cache-buster patterns set it explicitly. Document the diagnostic: cache miss with logged URL that differs only in a query param → suggest stripping.
- **HTTP/3 timing-fingerprint loss.** Documented limitation. Replay mode reports flagged `meta.degradations[{ capability: 'replay-protocol-faked' }]`. Tools doing protocol-level audits should not use replay.

## Composition with OpenSpec #1 (calibration + ghost mode + SPRT)

The full deterministic stack:

1. **Calibration** (`#1`) locks CPU-throttle factor and network profile to the user's machine — kills hardware variance.
2. **Ghost mode** (`#1`) opens a hidden warmup page before the measurement run — kills JIT-warmup variance.
3. **Replay** (`#4`, this change) fulfills every request from cache — kills network variance.
4. **SPRT early-stop** (`#1`) terminates trials when statistical confidence is reached — kills sample-size waste.

Documentation in `packages/replay-cache/README.md` includes a "Best-practice stacking" section: `--ghost --replay --record-or-source <X> --sprt` is the lowest-variance configuration physically achievable. Validation harness `tests/parity/full-stack-variance.test.ts` measures σ across all four stack levels (live alone, live+ghost, live+ghost+SPRT, live+ghost+SPRT+replay) and asserts monotonic improvement.

## UX surface summary

```bash
# Record once
ohmyperf run https://example.com --record --ghost

# Replay 20× to converge with SPRT, fail on cache miss
ohmyperf run https://example.com --replay --ghost --sprt --trials-max 20

# Replay from an explicit bundle
ohmyperf run https://example.com --replay-from ./reports/2026-05-19/report.json

# Reproduce a recorded measurement (anywhere, anytime)
pnpm tsx ./reports/2026-05-19/reproduce.ts
# → emits a new report.json with byte-identical input bytes

# Prune old caches
ohmyperf cache prune 500MB
```

MCP tool args:
```jsonc
{
  "tool": "measure",
  "args": {
    "url": "https://example.com",
    "replay": { "mode": "replay", "source": "auto" }
  }
}
// Response includes meta.bundleHash, artifacts.reproduceScriptRef
```
