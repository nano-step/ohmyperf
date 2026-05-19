# @ohmyperf/extension-chrome

MV3 Chrome extension; chrome.debugger-backed real-device runner.

## Architecture

Two entry points share the same engine:

1. **Toolbar click** (`chrome.action.onClicked`) — measures the current tab in-place; stores Report in `chrome.storage.session`; opens the bundled viewer.
2. **External bridge** (`chrome.runtime.onMessageExternal` + `onConnectExternal`) — invoked by the OhMyPerf SPA. Opens a **new background tab** with the target URL, attaches `chrome.debugger`, runs the engine, streams progress events back to the SPA over a long-lived port.

Both paths produce identical `Report.meta.browser.source === "extension-host"` artifacts.

## `externally_connectable`

The manifest declares an origin allowlist for `chrome.runtime.sendMessage` / `chrome.runtime.connect` from SPA pages:

```json
"externally_connectable": {
  "matches": [
    "https://ohmyperf.dev/*",
    "https://*.ohmyperf.dev/*",
    "http://localhost:3000/*",
    "http://127.0.0.1:3000/*"
  ]
}
```

The background SW additionally verifies `sender.origin` at runtime (defense in depth) and checks `PROTOCOL_VERSION` on every envelope. Mismatched protocol majors are rejected with `extension/invalid-request`.

See `openspec/changes/add-measurement-spa/deep-dives/phase-delta-extension.md` for the full wire-protocol spec.

## Chrome Web Store re-review

Adding `externally_connectable` triggers a CWS re-review (the listed origins are surfaced to reviewers).

**Submission timeline**: T-14 days before the SPA goes live. The runner backend keeps shipping in the meantime, so users are never without a measurement option.

### Permission justification copy

When updating the CWS listing, paste these into the corresponding fields:

- **`debugger`** — required to attach the CDP session that drives the engine. The user explicitly initiates each measurement via the toolbar icon or by submitting a URL on `ohmyperf.dev`. The extension never attaches to pages the user did not request.
- **`tabs`** — required to read the URL of the active tab for the same-tab-refusal check (we never measure the SPA's own page) and to listen for `chrome.tabs.onRemoved` so we can clean up if the user closes the target tab mid-measurement.
- **`activeTab`** — required for the legacy toolbar-click flow; grants temporary access to the user-clicked tab without `<all_urls>` host access.
- **`storage`** — `chrome.storage.session` only; stores the last measurement Report for the viewer page. Cleared on browser restart.
- **`host_permissions: <all_urls>`** — users supply arbitrary URLs to measure; we cannot enumerate them at packaging time. The extension never reads page content; CDP is used solely for performance metrics (CWV, navigation timing, paint timings).
- **`externally_connectable`** — limited to `ohmyperf.dev`, its subdomains, and localhost dev origins. Only verified, signed pages on those origins can request a measurement. The extension verifies `sender.origin` on every message and rejects everything else.

## Build

```bash
pnpm --filter @ohmyperf/extension-chrome build
```

Output: `extension-dist/` (load this directory via `chrome://extensions` → Load unpacked).

## Phase δ status

Phase δ wires the extension as a second measurement backend behind the SPA. Single-run only in v1 (multi-run is deferred to v1.5 via `chrome.offscreen`). See `openspec/changes/add-measurement-spa` for the full roadmap.
