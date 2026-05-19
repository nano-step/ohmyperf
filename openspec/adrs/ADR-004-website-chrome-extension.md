# ADR-004: Website surface uses a Chrome (MV3) extension as local runner via `chrome.debugger`; no WASM, no companion agent; Chrome/Edge only on Web in v1

- **Status**: Accepted
- **Date**: 2026-05-09
- **Deciders**: Sisyphus, Oracle (architecture), Metis (scope/risk dissent — see below)
- **Related design**: `design.md` D4; specs `chrome-extension-surface` and `website-surface`

## Context

The website surface (`ohmyperf.dev`) advertises "real machine, real browser" measurement. To honor that, the website cannot run measurements on a remote server (defeats the differentiator). It needs a way to drive the user's actual browser locally. Three architectures were considered:

1. **WASM browser-in-browser** — runs a synthetic browser inside the website. Cannot use real CDP. Defeats the "real machine" pitch.
2. **Localhost companion agent** — a downloadable native process that the website talks to over `wss://localhost:PORT` with a paired token. Browser-agnostic in principle.
3. **Chrome (MV3) extension** — an extension that uses `chrome.debugger` (real CDP) to drive the user's actual Chrome/Edge tab from the website's UI.

Metis flagged scope risk on (3): Chrome Web Store review pain, the visible "DevTools is debugging" infobar, profile-contamination from existing extensions. Oracle picked (3) anyway: 2-click install vs install-friction hell on Gatekeeper/SmartScreen/corp-Linux for (2). The user confirmed Oracle's pick.

## Decision

The website surface uses an **MV3 Chrome extension** as the local runner. The website (`ohmyperf.dev`) is a thin UI that postMessages with the extension's content script, which communicates with the background service-worker, which calls `chrome.debugger.attach({ tabId }, '1.3')` and bootstraps `@ohmyperf/core` (browser build) against the target.

Acceptable trade-offs:

- **Chrome / Edge only on website v1.** Firefox extensions cannot do this. WebKit can't at all. Documented in the website + capability matrix.
- **"DevTools is debugging this browser" infobar always visible.** Cannot be hidden by Chromium policy. Acceptable cost.
- **Runs in the user's current profile.** Existing extensions (uBlock, password manager, React DevTools) bias measurement. Mitigated by detecting other extensions and surfacing a banner; documented recommendation to use a clean profile or use the CLI for repeatable measurements.
- **CWS review cycles.** Extension submissions can take days; security releases must plan for the review window.

## Alternatives considered

- **(1) WASM browser-in-browser**: rejected. Defeats the differentiator. No real CDP.
- **(2) Companion agent**: rejected for v1. Install friction (Gatekeeper $99/yr Apple Developer + Windows EV cert $300–500/yr + corp-Linux signing nightmare) costs ~80% of casual users at the install gate. Adds a parallel codebase. Re-evaluable in v1.x if the extension surface proves limiting.
- **(4) Hybrid (extension + agent)**: two implementations to maintain; doubles surface area. Deferred.

## Consequences

- (+) 2-click install via Chrome Web Store; casual users can try the tool in 30 seconds.
- (+) Real CDP via `chrome.debugger` including `Target.setAutoAttach` for cross-origin OOPIFs (parity with the Playwright driver, with documented gaps).
- (+) Single codebase per surface; the extension and CLI share `@ohmyperf/core`.
- (-) Chrome/Edge only on the Website surface in v1. Firefox/WebKit users are directed to the CLI.
- (-) Profile contamination by other extensions; mitigated with a banner.
- (-) Service-worker termination is a real concern (MV3 SWs can be killed mid-run); spec mandates `chrome.storage.session` checkpointing.
- (-) Security model: `chrome.debugger` requires `<all_urls>` host permission — broad permission requires explicit CWS justification copy.

## Compliance / Validation

- The OOPIF synthetic test corpus runs against the extension driver in CI. Any drift versus the Playwright driver is documented in `apps/extension-chrome/COMPATIBILITY.md`.
- The website's `/extension` page detects non-Chromium UA and surfaces "Chrome/Edge only" inline.
- Manifest review: `permissions[]` exactly `['debugger', 'activeTab', 'scripting', 'storage']`; `host_permissions[]` exactly `['<all_urls>']`. Verified in CI.
