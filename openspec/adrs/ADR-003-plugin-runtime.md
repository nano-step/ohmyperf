# ADR-003: Plugins run in-process; trust = npm trust; shared reports are inert JSON, never re-execute plugin code; viewer plugins deferred

- **Status**: Accepted
- **Date**: 2026-05-09
- **Deciders**: Sisyphus, Oracle, Metis
- **Related design**: `design.md` D5; spec `plugin-system`

## Context

OhMyPerf is plugin-first: every metric, audit, reporter, transport, and collector is a plugin. With plugins comes the question: what's the security model? Three classes of plugin-execution context exist:

1. **CLI / IDE / npm SDK** on a user's machine: the user `npm install`'d the plugin. Trust is delegated to the npm install boundary, exactly like ESLint, Vite, Webpack, Rollup.
2. **Extension / Website viewer**: shared/exported reports may be opened by anyone. If reports could re-execute plugin code, attackers would ship "reports" that pwn random viewers.
3. **Custom UI for plugin data in shared reports**: a plugin author may want a custom React component to render their plugin's data. Allowing arbitrary third-party React in a public viewer is an XSS firehose.

## Decision

- **Trust = npm trust.** Plugins run in-process in the same Node (CLI/IDE) or browser (extension service worker) context as the engine. We do NOT use `worker_threads`, `vm` contexts, or subprocesses for plugin isolation in v1. Same model as ESLint/Vite/Webpack — proven in industry.
- **Lockfile integrity.** `ohmyperf.lock.json` records each plugin's resolved name, version, and SRI integrity hash (`sha384-...`). CI runs `--frozen-lockfile`; lockfile drift fails with exit code 9. First-time third-party plugins on a TTY trigger a one-time trust prompt persisted to `~/.config/ohmyperf/trust.json`. CI auto-trusts the lockfile.
- **Shared reports are inert JSON.** When a viewer renders a shared report (HTML reporter file, hosted `/r/:id`, IDE webview, extension popup), no plugin code is loaded or executed from the report. The viewer renders only the recorded `pluginData` field through known-safe React components.
- **No third-party viewer plugins in v1.** Built-in plugins (those shipped under `@ohmyperf/plugins-*`) MAY ship a sibling viewer-side React component that the viewer embeds at known paths. Third-party plugins SHALL render via a generic JSON-tree fallback in the viewer. v1.x may explore a sandboxed React-island model after the surface stabilizes.
- **Capability declarations.** Plugins declare every capability they intend to use (`'metric' | 'audit' | 'reporter' | 'transport' | 'collector' | 'lowLevel' | 'fs:read' | 'fs:write' | 'network'`). The engine logs every actual capability use to `report.meta.pluginCapabilityUses[]`. v1 logs only; v2+ MAY enforce.
- **Per-hook timeout.** Default 30s per plugin per hook; exceeded = exit code 8.

## Alternatives considered

- **`worker_threads` per plugin**: adds 50ms × N plugin startup; doesn't actually contain a malicious npm package (which can read `~/.ssh/` either way before the engine starts). Cost/benefit poor for v1.
- **`vm` contexts**: light isolation, escapable, often broken by JIT bugs.
- **Subprocess per plugin**: robust, slow (~100ms+ per spawn), heavy IPC for hot hooks.
- **Allow plugins to render UI in shared reports**: lets attackers exfiltrate viewer data via crafted React. Hard non-goal.

## Consequences

- (+) Simple, fast, predictable plugin runtime.
- (+) Clear security boundary: shared reports cannot pwn viewers; bad plugins can only hurt the user who opted into them.
- (+) Lockfile + integrity = supply-chain reproducibility for CI gates.
- (-) Buggy plugins can crash the engine (mitigated by per-hook timeout).
- (-) Custom UI for third-party plugin data is a flat JSON tree in v1 (mitigated by encouraging built-ins; revisited in v1.x).

## Compliance / Validation

- Static-analysis CI step: HTML reporter files are scanned for `eval(`, `new Function(`, or `import(` against report-controlled strings; any match fails the build.
- Hosted-share viewer is fronted by a strict CSP that disallows `eval` and inline-script execution sourced from report payloads.
- Acceptance test: a malicious-fixture report carrying `pluginData['evil']` containing `<script>` strings or `eval()` payloads SHALL render as flat JSON with no script execution.
