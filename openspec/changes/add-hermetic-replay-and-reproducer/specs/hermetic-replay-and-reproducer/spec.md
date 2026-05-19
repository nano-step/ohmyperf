# Spec: Hermetic Replay + Reproducer

## ADDED Requirements

### Requirement: MeasureOptions exposes an optional `replay` sub-object orthogonal to existing `Mode`
The engine MUST accept a new optional `replay` field on `MeasureOptions` to select record / replay behavior, distinct from the existing `Mode = 'real' | 'ci-stable'` calibration mode.

#### Scenario: Default behavior unchanged when `replay` is omitted
- **WHEN** `opts.replay` is `undefined`
- **THEN** the engine runs in live mode exactly as before this change
- **AND** the emitted `Report.meta.replayMode` equals `'live'`
- **AND** `Report.meta.bundleHash` is absent
- **AND** `Report.artifacts.reproduceScriptRef` is absent

#### Scenario: `mode: 'record'` engages the recorder
- **WHEN** `opts.replay = { mode: 'record' }`
- **THEN** the engine attaches a `RecorderHandle` to `rootSession` and to every session in `pageCtx.attachedFrames`
- **AND** attachment occurs AFTER `adapter.launchPageWithCdp()` returns BUT BEFORE `applyEmulation` AND BEFORE `pageCtx.goto`
- **AND** the run completes with `Report.meta.replayMode === 'record'` and `Report.meta.bundleHash` populated

#### Scenario: `mode: 'replay'` engages the player
- **WHEN** `opts.replay = { mode: 'replay', source: <path> }`
- **THEN** the engine attaches a `PlayerHandle` to `rootSession` and to every session in `pageCtx.attachedFrames`
- **AND** attachment occurs BEFORE any navigation request is issued (verified by the OOPIF debugger-wait race fixture)
- **AND** the run completes with `Report.meta.replayMode === 'replay'`

#### Scenario: `replay` is orthogonal to `Mode`
- **WHEN** `opts.replay = { mode: 'record' }` AND `opts.mode = 'ci-stable'`
- **THEN** the engine engages BOTH calibration locking AND recording in a single run
- **AND** no naming collision or option-conflict error is raised

### Requirement: Bundle hash is content-addressed and machine-deterministic
The recorder MUST produce a `bundleHash` that is byte-identical across machines, OSes, and Chromium versions for the same underlying network payload.

#### Scenario: Bundle hash is computed from sorted canonical inputs
- **WHEN** the recorder flushes
- **THEN** `bundleHash` equals `sha256(JSON-encode(sortedList))` where `sortedList` is the array of `(method, urlCanonical, contentType, cacheControlDirective, bodySha256)` tuples sorted lexicographically by `(method, urlCanonical)`
- **AND** `urlCanonical` lowercases scheme + host, sorts query parameters by key, and strips query parameters matching `opts.replay.urlCanonicalize.stripQueryRegex` (default: empty)
- **AND** `bodySha256` is the hex-encoded SHA-256 of the raw response body bytes as received from the wire (no line-ending normalization)
- **AND** header *names* are lowercased before being read; header *values* are read verbatim

#### Scenario: Excluded headers do not affect the hash
- **WHEN** two recordings of the same page differ only in `Date`, `X-Request-Id`, `Set-Cookie`, `Last-Modified`, `ETag`, `Server`, `X-Trace-Id`, `CF-Ray`, or any header matching `/^x-.*-(id|trace|debug)$/i`
- **THEN** the resulting `bundleHash` values are byte-identical
- **AND** the excluded headers are still stored in each cache entry for replay fidelity

#### Scenario: Cross-machine determinism
- **WHEN** the same fixture URL is recorded on `ubuntu-22.04` and on `macos-14` runners in CI
- **THEN** the two recordings produce byte-identical `bundleHash` values
- **AND** this is asserted by `tests/parity/replay-hash-cross-machine.test.ts`

#### Scenario: Method is part of the hash
- **WHEN** a recording contains both a `GET /api` and a `HEAD /api` to the same URL with identical response bodies
- **THEN** both entries are present in the bundle
- **AND** changing the response to `HEAD /api` while leaving `GET /api` unchanged changes the `bundleHash`

### Requirement: Cache directory layout follows a content-addressed blob store
The cache on disk MUST be laid out as `.ohmyperf/cache/<bundle_hash>/{manifest.json, entries/, blobs/}` with bodies above a size threshold stored separately.

#### Scenario: Small bodies are inlined; large bodies become blobs
- **WHEN** the recorder writes a 4 KB response body
- **THEN** the body is base64-encoded inline within `entries/<url_hash>.json`
- **WHEN** the recorder writes a 256 KB response body
- **THEN** the body is gzip-compressed (level 6) and stored at `blobs/<body_sha256>.gz`
- **AND** the entry references it via `{ "bodyRef": "<body_sha256>", "bodyEncoding": "gzip" }`
- **AND** the inline/blob threshold is 32 KB (configurable via `opts.replay.inlineBodyMaxBytes`, default 32768)

#### Scenario: Blob filenames are sha256-only
- **WHEN** the recorder writes any blob
- **THEN** the filename matches `^[0-9a-f]{64}\.gz$`
- **AND** no URL fragment, query parameter, or path component is embedded
- **AND** loading a manifest that references a blob path containing `..` or starting with `/` is rejected with `code: 'REPLAY_PATH_TRAVERSAL'`

#### Scenario: Manifest summarizes the bundle
- **WHEN** the recorder flushes
- **THEN** `manifest.json` contains `{ schemaVersion: 1, bundleHash, capturedAt, browserVersion, captureFingerprint, entries: [...], hmac }`
- **AND** `hmac` is computed over the canonical JSON of all fields EXCEPT `hmac` itself, keyed by `bundleHash`

### Requirement: HMAC integrity verification gates replay
The player MUST verify the manifest HMAC before serving any cached entry; a single invalid HMAC fails the entire replay.

#### Scenario: Valid manifest HMAC passes
- **WHEN** the player attaches with an untampered cache
- **THEN** HMAC verification succeeds and replay proceeds normally

#### Scenario: Tampered body fails replay attach
- **WHEN** a single byte of any cached body (inline or blob) is flipped on disk
- **THEN** the player computes a mismatched `bodySha256`, the recomputed manifest no longer matches the stored HMAC, and replay attach fails with `code: 'REPLAY_HMAC_MISMATCH'`
- **AND** the error message includes the bundle path and the first failing entry's URL
- **AND** no `Fetch.fulfillRequest` is issued for that bundle

#### Scenario: HMAC verification happens once, not per-fulfill
- **WHEN** the player serves 200 requests during a replay run
- **THEN** the manifest HMAC is verified exactly once at attach time, not per request
- **AND** this is verified by a unit test that mocks the HMAC verifier and counts call sites

### Requirement: Request-body matching is enforced for non-GET methods
The player MUST reject any non-GET/HEAD/OPTIONS request whose request body differs from the recorded one.

#### Scenario: Matching POST request body is fulfilled
- **WHEN** the recorded request was `POST /api { "user": "alice" }` and the page issues the same `POST /api { "user": "alice" }` during replay
- **THEN** the cached response is served via `Fetch.fulfillRequest`

#### Scenario: Mismatched POST request body fails
- **WHEN** the recorded request was `POST /api { "user": "alice" }` and the page issues `POST /api { "user": "bob" }` during replay
- **THEN** the player rejects the request with `code: 'REPLAY_REQUEST_BODY_MISMATCH'`
- **AND** the error structured payload includes `{ url, method, recordedBodySha256, observedBodySha256 }`

#### Scenario: JSON bodies are compared after canonical key sort
- **WHEN** the recorded body was `{"a":1,"b":2}` and the page issues `{"b":2,"a":1}`
- **THEN** the two are treated as equivalent (canonical JSON sort)
- **AND** the response is served normally

### Requirement: Cache miss policy is configurable and defaults to fail
The player MUST consult `opts.replay.onCacheMiss` when a request has no matching cached entry; default is `'fail'`.

#### Scenario: Default `'fail'` policy
- **WHEN** `opts.replay.onCacheMiss` is unset and the page issues a request with no cached entry
- **THEN** the player invokes `Fetch.failRequest` with `errorReason: 'NameNotResolved'` (placeholder; real failure stays distinguishable in logs)
- **AND** `meta.degradations` includes `{ capability: 'replay-cache-miss', url, severity: 'error' }`
- **AND** the engine surfaces the miss as a top-level error in the Report when miss count > 0

#### Scenario: `'allow-live'` policy passes through
- **WHEN** `opts.replay.onCacheMiss = 'allow-live'`
- **THEN** the player invokes `Fetch.continueRequest` (no fulfillment)
- **AND** `meta.degradations` includes `{ capability: 'replay-cache-miss', url, severity: 'warn', resolution: 'live-fallback' }`

#### Scenario: `'allow-empty'` policy returns an empty 200
- **WHEN** `opts.replay.onCacheMiss = 'allow-empty'`
- **THEN** the player invokes `Fetch.fulfillRequest` with `responseCode: 200, body: ''`
- **AND** `meta.degradations` includes `{ capability: 'replay-cache-miss', url, severity: 'warn', resolution: 'empty-200' }`

#### Scenario: CLI maps interactive prompt to a callback
- **WHEN** running `ohmyperf run <url> --replay` in an interactive TTY without `--no-prompt`
- **THEN** the CLI registers an `onCacheMiss` callback that prompts `"Cache miss for <url>. Re-record? [y/N]"` and on `y` re-launches the run in record mode
- **AND** with `--no-prompt`, the callback returns `'fail'` (no engine-level interactivity)

#### Scenario: MCP never prompts
- **WHEN** the MCP `measure` tool is invoked with `replay.mode = 'replay'` and a miss occurs
- **THEN** the structured error response is `{ code: 'REPLAY_CACHE_MISS', missingUrl, hint: 'Re-record with replay.mode = "record"' }`
- **AND** the tool result `isError` is true
- **AND** no prompt or stdin interaction is attempted

### Requirement: OOPIF Fetch handlers attach before navigation
The player MUST install `Fetch.enable` on every cross-origin frame session BEFORE its first request is issued.

#### Scenario: Cross-origin iframe requests are captured
- **WHEN** a page contains `<iframe src="https://cross.example/foo">` and the player engages replay
- **THEN** the player uses `Target.setAutoAttach({ autoAttach: true, waitForDebuggerOnStart: true, flatten: true })` on `rootSession`
- **AND** on `Target.attachedToTarget` for any frame target, the player installs `Fetch.enable` on the new session
- **AND** ONLY THEN does the player invoke `Runtime.runIfWaitingForDebugger` on the new session
- **AND** the iframe's first request is captured by `Fetch.requestPaused` and fulfilled from the bundle

#### Scenario: Race fixture asserts capture
- **WHEN** `tests/parity/replay-oopif-race.test.ts` runs against a cross-origin iframe fixture
- **THEN** the test asserts that the iframe's first request is fulfilled (not passed through) by inspecting `meta.degradations` for absence of `{ capability: 'replay-cache-miss' }` on the iframe URL

### Requirement: Service workers are uniformly bypassed during record and replay
The recorder and player MUST disable service worker interception via CDP to guarantee uniform behavior in v1.

#### Scenario: SW bypass during record
- **WHEN** the engine attaches the recorder
- **THEN** `Network.setBypassServiceWorker({ bypass: true })` is invoked on every session BEFORE any navigation
- **AND** the recorded bundle does NOT contain any SW-fetched responses (they all hit the network and are captured directly)

#### Scenario: SW bypass during replay
- **WHEN** the engine attaches the player
- **THEN** `Network.setBypassServiceWorker({ bypass: true })` is invoked on every session BEFORE any navigation
- **AND** the page's SW registration is not blocked, but the SW never intercepts any request during replay

#### Scenario: Report flags the SW bypass
- **WHEN** a report is emitted with `meta.replayMode` of `'record'` or `'replay'`
- **THEN** `Report.meta.swBypassed === true`

### Requirement: storageState capture is redacted before disk write
The recorder MUST pass captured `storageState` through a redactor function before writing it to the cache.

#### Scenario: Default redactor is share-client's `redactStorageState`
- **WHEN** `opts.replay.redactStorageState` is unset
- **THEN** the engine wires the default redactor from `@ohmyperf/share-client/redact` (`redactStorageState`)
- **AND** cookie values matching `/secret|token|jwt|password|api[_-]?key/i` keys, and localStorage values that look like JWTs or `eyJ...` patterns, are replaced with `<REDACTED>`
- **AND** the redacted storageState is what gets persisted to `.ohmyperf/cache/<bundle_hash>/storage-state.json`

#### Scenario: User opts out of redaction
- **WHEN** `opts.replay.redactStorageState = (s) => s` (identity function)
- **THEN** raw storageState is persisted
- **AND** `meta.degradations` includes `{ capability: 'replay-storage-state-unredacted', severity: 'warn' }`
- **AND** the CLI emits a stderr warning at run start

#### Scenario: Cache files use restrictive permissions
- **WHEN** the recorder writes any file under `.ohmyperf/cache/<bundle_hash>/`
- **THEN** the file mode is `0600` (POSIX systems)

### Requirement: Recorder emits a Report with `meta.bundleHash` and an executable `reproduce.ts`
Every record-mode run MUST produce a `reproduce.ts` next to `report.json` and surface its relative path in `artifacts.reproduceScriptRef`.

#### Scenario: `reproduce.ts` is emitted next to `report.json`
- **WHEN** a record-mode run completes
- **THEN** the engine writes `reproduce.ts` and `reproduce.config.json` to the same directory as `report.json`
- **AND** `Report.artifacts.reproduceScriptRef` equals `'./reproduce.ts'`
- **AND** `reproduce.config.json` contains `{ bundleHash, captureFingerprint, calibration, cacheDirRelative }`

#### Scenario: `reproduce.ts` is self-contained
- **WHEN** `reproduce.ts` is opened
- **THEN** it imports only from `playwright` and `@ohmyperf/replay-cache/standalone`
- **AND** it does NOT import from `@ohmyperf/core`, `@ohmyperf/plugins-builtin`, or any other workspace package
- **AND** it embeds calibration constants (CPU throttle factor, network profile name, viewport, UA, headless flag) as plain `const` literals

#### Scenario: `reproduce.ts` verifies fingerprint at start
- **WHEN** `pnpm tsx reproduce.ts` is invoked
- **THEN** the script computes `captureFingerprint` from the on-disk bundle + embedded calibration constants + current `chromiumMajorVersion` + current `nodeMajorVersion`
- **AND** if the computed fingerprint ≠ the embedded constant, the script exits with code `2` and a structured error explaining the mismatch
- **AND** if the fingerprint matches, the script launches Chromium, attaches the player to the embedded cache, navigates, and emits a new `report.json` next to itself

#### Scenario: 5 re-runs are stable
- **WHEN** `pnpm tsx reproduce.ts` is invoked 5 times against the same recorded bundle
- **THEN** the 5 emitted reports' median LCP values are within ±30 ms of each other
- **AND** this is asserted by `tests/parity/reproduce-stability.test.ts`

### Requirement: σ_replay is meaningfully smaller than σ_live
The validation harness MUST assert that recorded-replay variance is at most 30% of live variance for LCP on a representative fixture.

#### Scenario: Variance reduction target met
- **WHEN** `tests/parity/replay-variance.test.ts` runs 20 live trials against `tests/parity/fixtures/image-heavy-lcp`
- **AND** then records once and runs 20 replay trials against the same fixture
- **THEN** `σ_replay < 0.3 × σ_live` for `metrics.lcp.value`
- **AND** the test computes both σ values with Bessel's correction (n-1 denominator)

#### Scenario: Record overhead does not contaminate subsequent live runs
- **WHEN** the harness runs a record session then immediately runs 20 live trials in the SAME process
- **THEN** the live trial median LCP is within ±2 ms of the median LCP of 20 fresh-process live trials
- **AND** this validates record-mode CPU overhead does not bleed into post-record measurements

### Requirement: Record mode flags itself as non-measurement
The engine MUST emit `meta.degradations` flagging that record-mode reports are unsuitable for performance comparison.

#### Scenario: Record-mode degradation is emitted
- **WHEN** a report is emitted with `meta.replayMode === 'record'`
- **THEN** `meta.degradations` contains `{ capability: 'replay-record-overhead', severity: 'warn', detail: '...' }`
- **AND** the detail string explains the 10-30% wall-clock overhead from `getResponseBody` RPCs

#### Scenario: CLI warns at run start
- **WHEN** `ohmyperf run <url> --record` is invoked
- **THEN** the CLI prints a stderr warning: `"WARN: --record mode adds wall-clock overhead. Do not use these metrics for performance comparison. Use --replay against the recorded bundle instead."`

#### Scenario: MCP includes the warning in the structured response
- **WHEN** the MCP `measure` tool is invoked with `replay.mode = 'record'`
- **THEN** the response includes `meta.degradations[]` and a top-level `warning` field summarizing the same message

### Requirement: CLI flags `--record`, `--replay`, `--replay-from` work together with existing flags
The CLI MUST expose three new flags that map to `opts.replay` and reject invalid combinations.

#### Scenario: `--record` and `--replay` are mutually exclusive
- **WHEN** `ohmyperf run <url> --record --replay` is invoked
- **THEN** the CLI exits with code `1` and prints `"--record and --replay are mutually exclusive"` to stderr

#### Scenario: `--replay-from` accepts a report.json
- **WHEN** `ohmyperf run <url> --replay-from ./reports/2026-05-19/report.json` is invoked
- **THEN** the CLI reads `meta.bundleHash` from the JSON, locates `.ohmyperf/cache/<bundle_hash>/`, and sets `opts.replay = { mode: 'replay', source: <resolved-cache-dir> }`

#### Scenario: `--replay-from` accepts a cache directory
- **WHEN** `ohmyperf run <url> --replay-from ./.ohmyperf/cache/abc123.../` is invoked
- **THEN** the CLI verifies the directory contains `manifest.json` and sets the source directly

#### Scenario: `--replay-from` accepts a reproduce.ts
- **WHEN** `ohmyperf run <url> --replay-from ./reports/2026-05-19/reproduce.ts` is invoked
- **THEN** the CLI parses the sibling `reproduce.config.json` for the `cacheDirRelative` and sets the source

#### Scenario: Ambiguous `--replay-from` is rejected
- **WHEN** `ohmyperf run <url> --replay-from ./some-file` is invoked AND the file is neither a valid report.json, cache directory, nor reproduce.ts/config
- **THEN** the CLI exits with code `1` and prints a structured error explaining which of the three formats was expected

### Requirement: MCP tool surfaces `replay` arg + `bundleHash` + reproducer ref
The MCP `measure` tool MUST accept a `replay` sub-object and return `bundleHash` and `reproduceScriptRef` in its structured response.

#### Scenario: MCP records and returns metadata
- **WHEN** the MCP `measure` tool is invoked with `{ url, replay: { mode: 'record' } }`
- **THEN** the response includes `meta.replayMode === 'record'`, `meta.bundleHash` populated, and `artifacts.reproduceScriptRef` populated
- **AND** the tool result `isError` is false on success

#### Scenario: MCP replays from a path
- **WHEN** the MCP `measure` tool is invoked with `{ url, replay: { mode: 'replay', source: './reports/.../report.json' } }`
- **THEN** the source is resolved using the same precedence rules as `--replay-from`
- **AND** on cache miss, the response is `{ isError: true, error: { code: 'REPLAY_CACHE_MISS', missingUrl, hint } }`

#### Scenario: MCP rejects mutually-exclusive modes
- **WHEN** the MCP tool is invoked with `replay: { mode: 'record' }` AND any other field that would imply replay (e.g. `replay.source`)
- **THEN** the tool returns a validation error before launching Chromium

### Requirement: `packages/replay-cache` runtime bundle stays under budget
The new package MUST ship with a gzipped runtime bundle no larger than 80 KB total and 30 KB for the standalone subpath.

#### Scenario: Bundle budget enforced in CI
- **WHEN** `pnpm test --filter @ohmyperf/replay-cache --grep "bundle-budget"` runs
- **THEN** `dist/index.js.gz` is at most 80 KB
- **AND** `dist/standalone.js.gz` is at most 30 KB
- **AND** the test fails CI on regression with an actionable error including the current and target sizes

#### Scenario: Standalone subpath excludes recorder and codegen
- **WHEN** the standalone bundle is built
- **THEN** statically analyzed imports include cache/, player/, and hash/sign utilities but NOT recorder/ or codegen/
- **AND** this is enforced via `eslint-plugin-import/no-restricted-paths`

### Requirement: Existing live-mode runs are byte-identical to pre-change runs
The change MUST be additive-only such that any existing CLI / MCP / extension invocation without the new flags produces an unchanged Report.

#### Scenario: No-flag CLI run is unchanged
- **WHEN** `ohmyperf run <fixture-url>` is invoked without any new flag against a deterministic fixture
- **THEN** the emitted `report.json` is byte-identical to the report emitted by the pre-change build on the same fixture, after normalizing timestamp fields
- **AND** `meta.replayMode === 'live'`, `meta.bundleHash` absent, `artifacts.reproduceScriptRef` absent

#### Scenario: Schema version unchanged
- **WHEN** the Report's `schemaVersion` field is read
- **THEN** it equals `'1.0.0'` (no bump required for additive optional fields)

### Requirement: Cache pruning via CLI subcommand
The CLI MUST ship a `cache prune` subcommand to manually evict bundles when the cache exceeds a user-specified size.

#### Scenario: Prune by total size
- **WHEN** `ohmyperf cache prune 500MB` is invoked
- **THEN** the CLI inspects `.ohmyperf/cache/`, identifies bundles by mtime ascending, and deletes whole bundle directories (never partial) until total size ≤ 500 MB
- **AND** prints a summary of bundles deleted with their hashes and sizes

#### Scenario: Prune is bundle-atomic
- **WHEN** pruning is interrupted (e.g. SIGINT) partway through deleting a bundle
- **THEN** the partial bundle on disk is detected on next access (manifest HMAC mismatch or missing files) and the next replay attach fails with `code: 'REPLAY_BUNDLE_INCOMPLETE'`
- **AND** the structured error suggests `ohmyperf cache prune --repair`

### Requirement: Composition with ghost mode + SPRT achieves lowest physically possible variance
The README MUST document the canonical stacking and the validation harness MUST assert monotonic variance reduction.

#### Scenario: Full-stack variance assertion
- **WHEN** `tests/parity/full-stack-variance.test.ts` runs the fixture under four configurations in sequence
- **THEN** σ_live > σ_live+ghost ≥ σ_live+ghost+sprt > σ_live+ghost+sprt+replay
- **AND** the test reports each σ in the test output for visibility

#### Scenario: README documents the stack
- **WHEN** `packages/replay-cache/README.md` is opened
- **THEN** it contains a "Best-practice stacking" section enumerating the four variance-reduction primitives and recommending `--ghost --replay --record-or-source <X> --sprt` as the canonical lowest-variance configuration
