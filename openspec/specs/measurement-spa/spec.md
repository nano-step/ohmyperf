# Spec — Measurement SPA capability

## ADDED Requirements

### Requirement: Interactive URL measurement on landing page

The website surface SHALL accept a user-supplied URL on the landing page and produce a complete `Report` (per frozen `@ohmyperf/core` 1.0 schema) using a real CDP-driven measurement engine. The measurement SHALL NOT be a synthetic emulation; it SHALL use the same engine code paths as `apps/cli`.

#### Scenario: User submits a valid public URL with extension installed

- **WHEN** a user enters `https://example.com` in the landing form and submits
- **AND** the Chrome extension is installed with manifest version compatible with the SPA
- **THEN** the SPA SHALL send a `ohmyperf/measure` message via `chrome.runtime.sendMessage` to the extension
- **AND** the extension SHALL open the target URL in a new background tab
- **AND** the extension SHALL attach `chrome.debugger` and run the engine
- **AND** progress events SHALL stream back to the SPA via a `chrome.runtime.connect` port
- **AND** the final `Report` SHALL be persisted to IndexedDB
- **AND** the SPA SHALL navigate to `/report/[id]` showing the rendered metrics dashboard

#### Scenario: User submits a valid public URL with local runner only

- **WHEN** the Chrome extension is NOT installed but the local runner is reachable at `http://localhost:5174`
- **AND** the user submits a URL
- **THEN** the SPA SHALL POST to `http://localhost:5174/api/measure`
- **AND** the runner SHALL respond `202` with a `jobId`
- **AND** the SPA SHALL open an `EventSource` to `/api/jobs/:id/events`
- **AND** progress events SHALL render live in the UI
- **AND** on `complete` event the report SHALL be saved to IndexedDB
- **AND** the SPA SHALL navigate to `/report/[id]`

#### Scenario: No measurement backend available

- **WHEN** neither the extension nor a local runner is detected within 800ms
- **THEN** the SPA SHALL display a backend-card with two CTAs:
  - "Install Chrome extension" linking to the CWS listing
  - "Run locally with Docker" linking to docker-compose instructions on GitHub
- **AND** the URL form SHALL be disabled with a tooltip explaining the requirement

#### Scenario: User submits a private/internal URL

- **WHEN** the user enters `http://192.168.1.1/admin` or `http://localhost:8080`
- **AND** the measurement is dispatched to the runner
- **THEN** the runner SHALL reject with HTTP 403 and error code `ssrf/blocked-range`
- **AND** the SPA SHALL display a friendly error: "Refusing to measure private/internal IP. Set `OHMYPERF_RUNNER_ALLOW_PRIVATE=1` if you intend to measure private addresses."

### Requirement: Backend auto-detection

The SPA SHALL detect available measurement backends on page load via parallel pings with bounded timeout, and SHALL prefer the extension when both are available.

#### Scenario: Both backends present

- **WHEN** both the extension responds to `ohmyperf/ping` AND the runner responds to `GET /api/health` within 800ms
- **THEN** the SPA SHALL select the extension backend
- **AND** the UI SHALL show "Chrome extension v{version} ready"
- **AND** a secondary indicator SHALL note "Local runner also available"

#### Scenario: Detection retry on user demand

- **WHEN** the user clicks "Re-detect backends" in the backend-card
- **THEN** the SPA SHALL re-run the parallel ping
- **AND** SHALL update the displayed backend state

### Requirement: Live progress streaming

Both measurement paths (extension, runner) SHALL emit a uniform `ProgressEvent` stream to the SPA, where each event carries a `type` discriminator and is rendered as a step in the progress UI.

#### Scenario: Multi-run measurement progress

- **WHEN** a runner-path measurement is in flight with `runs: 5`
- **THEN** the SPA SHALL receive at minimum: `queued`, `run-start (×5)`, `navigation`, `run-complete (×5)`, `complete`
- **AND** the UI SHALL update a progress bar showing `currentRun / totalRuns`
- **AND** each completed run SHALL display its CWV values immediately, not just at the end

#### Scenario: Measurement failure mid-run

- **WHEN** the runner emits a `error` event with code `navigation/timeout` after run 2 of 5
- **THEN** the SPA SHALL stop the progress UI and render the typed error
- **AND** SHALL offer "Retry" and "Cancel" actions
- **AND** any partial runs SHALL NOT be persisted as a complete Report

#### Scenario: SPA reloads mid-measurement

- **WHEN** the user reloads the SPA while an SSE measurement is in flight
- **AND** the runner is still processing the job
- **THEN** the SPA SHALL reconnect to `/api/jobs/:id/events`
- **AND** the runner SHALL replay the last N events from its buffer so the new connection sees current progress
- **AND** the measurement SHALL continue uninterrupted

#### Scenario: Runner restarts mid-job

- **WHEN** the runner restarts (in-memory queue lost) while a measurement is in flight
- **AND** the SPA attempts to reconnect to `/api/jobs/:id/events`
- **THEN** the runner SHALL respond `404` with `{ error: { code: 'job/not-found', message } }`
- **AND** the SPA SHALL display: "Runner restarted, measurement lost. Try again."

#### Scenario: DevTools attached to target tab (extension path)

- **WHEN** the extension attempts `chrome.debugger.attach` on the target tab
- **AND** DevTools is already open on that tab
- **THEN** the extension SHALL emit an `error` event with code `extension/devtools-attached`
- **AND** the SPA SHALL display: "Close DevTools on the target tab and retry" with a Retry button

#### Scenario: Target tab closed mid-measurement (extension path)

- **WHEN** the user closes the target tab while the extension is measuring it
- **THEN** the extension SHALL detect via `chrome.tabs.onRemoved`
- **AND** SHALL emit `error` event with code `extension/target-tab-closed`
- **AND** SHALL detach `chrome.debugger` cleanly
- **AND** the SPA SHALL display: "Target tab was closed before measurement completed."

#### Scenario: User cancels in-flight measurement

- **WHEN** the user clicks the Cancel button during a runner measurement
- **THEN** the SPA SHALL send `DELETE /api/jobs/:id` to the runner
- **AND** the runner SHALL kill the in-flight Playwright context
- **AND** SHALL emit a final `error` event with code `job/cancelled` to all SSE subscribers
- **AND** SHALL respond `200` to the DELETE

### Requirement: Persistent report storage and history

Reports SHALL persist to IndexedDB on the user's device. Storage SHALL be capped at 200MB total; oldest reports SHALL be evicted automatically when exceeded.

#### Scenario: Save and retrieve a report

- **WHEN** a measurement completes and `Report` is saved to IndexedDB with id `R1`
- **AND** the user later navigates to `/report/R1`
- **THEN** the SPA SHALL load the Report from IndexedDB
- **AND** render the full dashboard without contacting any backend

#### Scenario: Storage quota exceeded

- **WHEN** the sum of all stored reports exceeds 200MB after a new save
- **THEN** the SPA SHALL evict reports oldest-first by `createdAt` index until total ≤ 200MB
- **AND** a toast SHALL inform the user: "Removed N old reports to free space."

#### Scenario: User clears all reports

- **WHEN** the user clicks "Clear all reports" on `/report` index and confirms
- **THEN** all entries in the `reports` and `jobs` IndexedDB stores SHALL be deleted
- **AND** the index SHALL show the empty state with "Measure your first URL" CTA

### Requirement: Static export deployability

The SPA SHALL build as a fully static export consumable by Cloudflare Pages, GitHub Pages, or any static file host. No server-side runtime SHALL be required for the production SPA.

#### Scenario: Production build is static

- **WHEN** `pnpm --filter @ohmyperf/website build` completes
- **THEN** the `apps/website/out/` directory SHALL contain only static files (`.html`, `.js`, `.css`, assets)
- **AND** there SHALL be NO Node.js server entrypoint required to serve them
- **AND** opening `out/index.html` via `file://` or any static server SHALL render the landing

### Requirement: Drag-and-drop JSON report viewer

The SPA SHALL accept a `report.json` file dropped onto the `/viewer` route and SHALL render the full metrics dashboard without contacting any backend or persisting the report (unless the user explicitly saves it).

#### Scenario: User drops a valid report JSON

- **WHEN** the user drags a `report.json` (schema version `1.x`) onto the `/viewer` drop zone
- **THEN** the SPA SHALL parse the JSON in the browser
- **AND** SHALL validate the schema version (reject unknown major)
- **AND** SHALL render the report using the same `<ReportViewer />` component used at `/report/[id]`
- **AND** SHALL offer "Save to history" and "Discard" actions

#### Scenario: User drops an invalid file

- **WHEN** the user drops a file that is not valid JSON OR is not a valid OhMyPerf report
- **THEN** the SPA SHALL display a typed error explaining the issue
- **AND** SHALL NOT crash

### Requirement: Local runner HTTP contract

The local runner SHALL expose a stable HTTP contract that any client (SPA, MCP server, third-party scripts) can consume. The contract SHALL be versioned and additive within `1.x`.

#### Scenario: Health check

- **WHEN** a client sends `GET /api/health`
- **THEN** the runner SHALL respond `200` with `{ ok: true, version, engine, browser: { source: "bundled" | "system" | "extension-host", version } }` (literals pinned to `packages/core/src/types.ts:135` BrowserInfo union)
- **AND** SHALL respond within 100ms when warm

#### Scenario: Measurement request validation

- **WHEN** a client sends `POST /api/measure` with an invalid body (e.g., missing `url`, invalid type for `runs`)
- **THEN** the runner SHALL respond `400` with `{ error: { code, message } }` per the structured error format
- **AND** SHALL NOT enqueue a job

#### Scenario: SSE event stream

- **WHEN** a client subscribes to `GET /api/jobs/:id/events`
- **THEN** the runner SHALL send `Content-Type: text/event-stream`
- **AND** SHALL emit events in the order: `queued`, `run-start`, `navigation`, `metric`, `run-complete`, `complete` (or `error`)
- **AND** SHALL close the connection after `complete` or `error`

### Requirement: Cross-origin and Private Network Access support

The runner SHALL accept requests from the production SPA origin and the local development SPA origin. The runner SHALL respond to Private Network Access preflight requests to enable HTTPS-to-localhost fetches.

#### Scenario: Allowed origin preflight

- **WHEN** a browser sends `OPTIONS /api/measure` with `Origin: https://ohmyperf.dev` and `Access-Control-Request-Private-Network: true`
- **THEN** the runner SHALL respond `204` with headers including:
  - `Access-Control-Allow-Origin: https://ohmyperf.dev`
  - `Access-Control-Allow-Private-Network: true`
  - `Access-Control-Allow-Methods: GET, POST, OPTIONS`

#### Scenario: Disallowed origin

- **WHEN** a browser sends a request with `Origin: https://evil.example.com`
- **THEN** the runner SHALL respond WITHOUT `Access-Control-Allow-Origin` header
- **AND** the browser SHALL block the request per CORS policy

### Requirement: Extension externally_connectable surface

The Chrome extension SHALL accept messages from a tightly-scoped allowlist of web origins. The allowlist SHALL include the production SPA origin and localhost dev origin only.

#### Scenario: SPA pings extension

- **WHEN** a page on `https://ohmyperf.dev` calls `chrome.runtime.sendMessage(EXT_ID, { type: 'ohmyperf/ping' })`
- **THEN** the extension SHALL respond `{ ok: true, version }`

#### Scenario: Unauthorized origin pings extension

- **WHEN** a page on `https://random.example.com` attempts the same call
- **THEN** Chrome SHALL prevent delivery per the `externally_connectable.matches` allowlist
- **AND** the unauthorized page SHALL receive `chrome.runtime.lastError`

#### Scenario: Extension refuses self-measurement

- **WHEN** the SPA at `https://ohmyperf.dev` requests measurement of `https://ohmyperf.dev/some-page`
- **THEN** the extension SHALL respond with error code `extension/self-measurement-refused`
- **AND** the SPA SHALL display guidance: "Open the target site in a separate tab and use the toolbar button there."

### Requirement: Bundle and performance budgets (dogfood gate)

The SPA SHALL meet its own performance budgets enforced by CI. The landing page SHALL pass OhMyPerf's CWV thresholds when measured against itself.

#### Scenario: Landing first-load JS budget

- **WHEN** the production build is analyzed via `@next/bundle-analyzer`
- **THEN** the first-load JS for `/` SHALL be ≤ 150KB gzipped
- **AND** CI SHALL fail if the budget is exceeded

#### Scenario: Self-measured CWV gate

- **WHEN** the weekly dogfood workflow runs `ohmyperf run https://ohmyperf.dev --mode ci-stable --runs 5`
- **THEN** the median LCP SHALL be ≤ 2500ms
- **AND** the median INP SHALL be ≤ 200ms
- **AND** the median CLS SHALL be ≤ 0.10
- **AND** CI SHALL fail if any threshold is violated

### Requirement: Accessibility (WCAG 2.1 AA)

The SPA SHALL pass axe-core WCAG 2.1 AA checks on all primary routes. Keyboard navigation SHALL be fully supported.

#### Scenario: Automated accessibility check in CI

- **WHEN** the CI pipeline runs Playwright tests with `@axe-core/playwright` against `/`, `/measure`, `/report/[id]`, `/viewer`, `/report`
- **THEN** zero violations of severity `serious` or `critical` SHALL be reported

#### Scenario: Keyboard-only flow

- **WHEN** a user navigates the SPA using only Tab, Shift+Tab, Enter, Space, and Esc
- **THEN** the user SHALL be able to: focus the URL input, submit the form, navigate the progress UI, open and close dialogs
- **AND** focus indicators SHALL be visible on all interactive elements

### Requirement: No third-party telemetry

The SPA SHALL make zero network requests to known analytics or tracking
domains during any user-facing flow on `/`, `/measure`, `/viewer`, or `/report`.

#### Scenario: Telemetry-free landing and flows

- **WHEN** a Playwright test loads `/`, `/measure`, `/viewer`, and `/report`,
  and submits the URL form
- **THEN** zero requests SHALL be made to hostnames in the maintained
  tracker-domain list (`apps/website/tests/no-telemetry.spec.ts`)
