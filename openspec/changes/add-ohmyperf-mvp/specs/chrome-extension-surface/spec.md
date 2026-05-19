# Capability: chrome-extension-surface

The MV3 Chrome extension that drives CDP from the user's actual browser via `chrome.debugger`.

## ADDED Requirements

### Requirement: Manifest v3
The extension SHALL ship a Manifest v3 manifest declaring (at minimum) the permissions: `debugger`, `activeTab`, `scripting`, `storage`, plus host permissions for `<all_urls>` (required for `chrome.debugger.attach`). The extension SHALL NOT request `tabs` for cross-tab snooping nor `cookies` (which would broaden the privacy surface).

#### Scenario: Manifest review checklist
- **WHEN** the manifest is built for Chrome Web Store submission
- **THEN** `permissions[]` is exactly the documented set (`debugger`, `activeTab`, `scripting`, `storage`)
- **AND** `host_permissions[]` is exactly `["<all_urls>"]`
- **AND** the manifest's `description` and `permissions_justification` (CWS-required) explicitly mention "perf measurement via DevTools Protocol"

### Requirement: "Measure this page" entry point
The extension SHALL provide a browser-action button. Clicking it on a tab SHALL: (1) attach the debugger via `chrome.debugger.attach({ tabId }, '1.3')`, (2) bootstrap `@ohmyperf/core` in the extension service-worker against that target, (3) execute one measurement run with default `runs: 5` in `real` mode, (4) detach when complete, (5) open a new tab to the viewer (either local extension page `viewer.html` or `https://ohmyperf.dev/viewer` with the report passed via `postMessage` to the website's content script).

#### Scenario: Button measures active tab
- **WHEN** the user clicks the extension button on a tab pointing at `https://example.com`
- **THEN** within 500 ms the "DevTools is debugging this browser" infobar appears
- **AND** within ~30 seconds (5 runs × ~5s) the run completes and the viewer opens with the report

#### Scenario: chrome:// blocked gracefully
- **WHEN** the user clicks the button on a `chrome://settings` tab
- **THEN** the extension shows a popup: "Cannot measure chrome:// URLs"
- **AND** does NOT attempt to attach the debugger

### Requirement: OOPIF support via `chrome.debugger`
The extension SHALL enable OOPIF auto-attach using the same flow as the CLI driver (`Target.setAutoAttach { flatten: true }`) and SHALL achieve parity with the CLI on the OOPIF synthetic test corpus. Where the `chrome.debugger` API differs from raw CDP-over-WebSocket, the `@ohmyperf/driver-extension` package SHALL document and shim the differences.

#### Scenario: Extension OOPIF parity
- **WHEN** the extension's CI suite runs `tests/oopif-corpus/` against the extension driver
- **THEN** the same passing fixtures as the Playwright driver pass under the extension driver (within documented limitations: e.g. cannot attach to chrome-extension:// frames)

### Requirement: Profile-contamination warning
The extension SHALL detect at attach-time whether the user has installed extensions other than `ohmyperf` itself, and SHALL surface a non-blocking banner in the viewer warning that other extensions may bias measurement (uBlock can lower LCP by 200–400 ms; password managers can affect form-render timing).

#### Scenario: Warning banner shown
- **WHEN** measurement runs in a Chrome profile with at least one other enabled extension
- **THEN** the viewer's report-meta panel includes a banner: "Other extensions detected — measurement may be biased. Consider running in a clean profile."

### Requirement: Privacy: no measurement uploaded by default
The extension SHALL NOT upload measurement results, page content, or any telemetry by default. Sharing requires the explicit user action of clicking "Share" in the viewer (which triggers the redaction pipeline + confirmation preview, per the `reporting-and-sharing` capability).

#### Scenario: No automatic upload
- **WHEN** the user clicks the extension button to measure a tab
- **THEN** no network request is made by the extension to any third-party origin
- **AND** the only network requests originate from the page being measured

#### Scenario: Manual share goes through redaction
- **WHEN** the user clicks "Share" in the viewer after a measurement
- **THEN** the share flow passes through the same redaction + preview + scrubber as the CLI's `share` subcommand

### Requirement: MVP scope only
The v1 extension SHALL implement only the "button → measure → viewer" flow. v1 SHALL NOT include: scenario recording, plugin UI, in-extension report storage beyond the most recent run, multi-tab orchestration, or budget configuration. These are deferred to v1.x updates after Chrome Web Store review patterns stabilize.

#### Scenario: No scenario recording in v1
- **WHEN** the user inspects the extension popup in v1
- **THEN** there is no "record flow" or scenario-related UI

### Requirement: Update channel
The extension SHALL publish to the Chrome Web Store under a publisher account verified to the `ohmyperf` GitHub org (decision recorded in P0 trademark/marketplace audit). Updates SHALL flow through CWS only — no auto-update from a user-controlled URL.

#### Scenario: CWS-only updates
- **WHEN** a security release ships
- **THEN** the new version is uploaded to CWS and propagates within CWS's normal review window
- **AND** no other update channel is solicited or supported

### Requirement: Service-worker lifetime
The extension's service worker SHALL gracefully handle MV3 service-worker termination during a measurement: state is persisted via `chrome.storage.session` after each run, and on resume the run is resumed-or-aborted with a clear status to the popup UI.

#### Scenario: SW killed mid-run
- **WHEN** Chrome terminates the extension's service worker mid-run
- **AND** the user reopens the popup
- **THEN** the popup shows "Run aborted by browser; click again to retry" rather than appearing hung
