# Phase δ — Extension bridge: code-level spec

> **Critical correction applied**: query asked parity test to assert `Report.meta.browser.source` as `'extension'` vs `'playwright'`. Actual union in `packages/core/src/types.ts:135` is `"bundled" | "system" | "extension-host"`. Extension path already sets `extension-host` (`background.ts:93`), runner uses `bundled`. Use those literal values.
>
> Also: `runEngine` (`engine.ts:83`) returns a `Report` synchronously — no progress hooks today. The runner's SSE schema (D7) is the de-facto `ProgressEvent` shape. We synthesize coarse-grained navigation events around `runEngine`; `metric` events are NOT emitted in v1.

---

## A. `manifest.json` — full file with diff

**Path**: `apps/extension-chrome/static/manifest.json`

```diff
 {
   "manifest_version": 3,
   "name": "OhMyPerf",
   "version": "0.0.0",
   "description": "Real-machine, real-browser web performance measurement via chrome.debugger.",
-  "permissions": ["debugger", "storage", "activeTab"],
+  "permissions": ["debugger", "storage", "activeTab", "tabs"],
   "host_permissions": ["<all_urls>"],
+  "externally_connectable": {
+    "matches": [
+      "https://ohmyperf.dev/*",
+      "https://*.ohmyperf.dev/*",
+      "http://localhost:3000/*",
+      "http://127.0.0.1:3000/*"
+    ]
+  },
   "action": { "default_title": "Measure performance on this tab" },
   "background": { "service_worker": "background.bundle.js", "type": "module" },
   "web_accessible_resources": [
     { "resources": ["viewer.html", "viewer.bundle.js"], "matches": ["<all_urls>"] }
   ],
   "minimum_chrome_version": "116"
 }
```

### Privacy / permission review

- **`host_permissions: <all_urls>`** — keep. Users supply arbitrary URLs; can't enumerate at packaging time. Justify to CWS reviewer accordingly.
- **`"tabs"` added** — required for `tab.url` read (same-tab refusal check, §G) and `chrome.tabs.onRemoved` context (§I).
- **`activeTab`** — keep for legacy `chrome.action.onClicked` flow.
- **`debugger`** — unchanged.

### `minimum_chrome_version: "116"` — still correct

- `externally_connectable.matches` stable since Chrome 18.
- PNA does not gate `chrome.runtime.sendMessage`.
- Chrome 116 covers `crypto.randomUUID()`, `chrome.storage.session`, `chrome.tabs.create({ openerTabId })`.

---

## B. Message envelope schema

**New package**: `packages/shared-types` (δ.2). Bumps `PROTOCOL_VERSION` only on breaking changes; bridge rejects mismatched majors.

**Path**: `packages/shared-types/src/bridge.ts`

```ts
export const PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

export interface BaseEnvelope { readonly protocolVersion: ProtocolVersion }

export type BridgeErrorCode =
  | "extension/invalid-request"
  | "extension/unsupported-runs"
  | "extension/self-measurement-refused"
  | "extension/devtools-attached"
  | "extension/target-tab-closed"
  | "extension/debugger-detached"
  | "extension/tab-create-failed"
  | "extension/engine-error"
  | "extension/cancelled"
  | "extension/internal";

export interface BridgeError {
  readonly code: BridgeErrorCode;
  readonly message: string;
  readonly retriable: boolean;
}

// --- sendMessage (request/response) ---

export type BridgeCapability = "single-run" | "real-mode" | "ci-stable-mode" | "progress-port-v1";

export interface PingRequest extends BaseEnvelope { readonly type: "ohmyperf/ping" }
export interface PingResponse extends BaseEnvelope {
  readonly type: "ohmyperf/ping/response";
  readonly ok: true;
  readonly version: string;          // extension manifest.version
  readonly capabilities: ReadonlyArray<BridgeCapability>;
}

export interface MeasureRequest extends BaseEnvelope {
  readonly type: "ohmyperf/measure";
  readonly url: string;
  readonly runs: 1;                  // v1: single-run only
  readonly mode: "real" | "ci-stable";
  readonly cacheMode?: "cold" | "warm" | "cold-then-warm";
  readonly includeTrace?: boolean;
}
export interface MeasureAck extends BaseEnvelope {
  readonly type: "ohmyperf/measure/ack";
  readonly ok: true;
  readonly jobId: string;            // uuid v4
  readonly portName: string;         // 'ohmyperf/job/<jobId>'
}

export interface CancelRequest extends BaseEnvelope {
  readonly type: "ohmyperf/cancel";
  readonly jobId: string;
}
export interface CancelResponse extends BaseEnvelope {
  readonly type: "ohmyperf/cancel/response";
  readonly ok: boolean;
}

export interface ErrorResponse extends BaseEnvelope {
  readonly type: "ohmyperf/error";
  readonly ok: false;
  readonly error: BridgeError;
}

export type RequestEnvelope = PingRequest | MeasureRequest | CancelRequest;
export type ResponseEnvelope = PingResponse | MeasureAck | CancelResponse | ErrorResponse;

// --- chrome.runtime.connect (port stream) — mirrors runner SSE schema ---

export type PortEvent =
  | { protocolVersion: ProtocolVersion; type: "queued"; jobId: string; ts: number }
  | { protocolVersion: ProtocolVersion; type: "run-start"; jobId: string; runIndex: 0; totalRuns: 1; ts: number }
  | { protocolVersion: ProtocolVersion; type: "navigation"; jobId: string; runIndex: 0; phase: "started" | "committed" | "loaded" | "idle"; ts: number }
  | { protocolVersion: ProtocolVersion; type: "metric"; jobId: string; runIndex: 0; name: string; value: number; ts: number }
  | { protocolVersion: ProtocolVersion; type: "run-complete"; jobId: string; runIndex: 0; ts: number }
  | { protocolVersion: ProtocolVersion; type: "complete"; jobId: string; report: import("@ohmyperf/core").Report; ts: number }
  | { protocolVersion: ProtocolVersion; type: "error"; jobId: string; error: BridgeError; ts: number };
```

---

## C–N. Background handler, port streaming, SW lifecycle, debugger lifecycle, same-tab refusal, DevTools detection, tab-close detection, new-tab UX, build, CWS timeline, parity test, open questions

(See full content — saved earlier in conversation; key takeaways:)

- **`onMessageExternal`** with origin verification + `protocolVersion` check
- **`onConnectExternal`** for port named `ohmyperf/job/<id>`; replay buffer (last 50); on disconnect, job CONTINUES (single-run is ~10–15s)
- **MV3 SW lifecycle**: single-run safely fits inside 30s idle; debugger attachment + port keeps SW alive
- **`exactUrlMatch`** for same-tab refusal — R10 decision (no eTLD+1 heuristic)
- **DevTools detection**: pattern match `"another debugger"` → emit `extension/devtools-attached` with retriable=true
- **Tab close**: scoped `onRemoved` listener per job; cleanup on teardown
- **New-tab UX**: `active: false`, `pinned: false`, `openerTabId`, leave open after measurement (defer auto-close to ε)
- **Build pipeline**: no changes to `bundle-extension.mjs`; expected +20KB bundle
- **CWS re-review**: submit T-14 days; justification copy for each permission
- **Parity test**: `extension-host` vs `bundled` (corrected from query); CWV CoV ≤ 30% for v1 single-run

## Effort: **Large (3d+)**

## Watch out for

- **External port `postMessage` payload cap** ~64MB; full Report with trace can exceed. v1 default excludes trace. Add `emit()` size guard at >10MB.
- **`onMessageExternal` listener MUST return `true`** for async `sendResponse`.
- **`tabs.create` with `openerTabId`** falls back gracefully if opener tab closed.

## Future (out of δ)

1. Multi-run via `chrome.offscreen` document for SW longevity (v1.5)
2. Add `onProgress` callback to `runEngine` so port `metric` events become real (core-package change, alongside multi-run)
