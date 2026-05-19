# Capability: plugin-system

Typed plugin runtime: lifecycle hooks, capability declarations, in-process execution, lockfile-frozen integrity, inert-shared-report guarantee.

## ADDED Requirements

### Requirement: Plugin interface
A plugin SHALL be a TypeScript module that default-exports an object satisfying:

```ts
interface Plugin {
  id: string;                                       // reverse-DNS, e.g. 'dev.ohmyperf.cwv'
  version: string;                                  // semver
  apiVersion: '1';                                  // engine compatibility band
  capabilities?: Capability[];                      // ('metric'|'audit'|'reporter'|'transport'|'collector'|'lowLevel'|'fs:read'|'fs:write'|'network')[]
  setup?(ctx: SetupCtx): Promise<void> | void;
  hooks?: Partial<PluginHooks>;
  teardown?(ctx: TeardownCtx): Promise<void> | void;
}
```

The engine SHALL refuse to load any plugin whose `apiVersion` is not within the engine's supported band (currently only `'1'`). The engine SHALL refuse to load a plugin whose `id` collides with an already-registered plugin in the same run.

#### Scenario: Plugin with mismatched apiVersion rejected
- **WHEN** `measure({ url, plugins: [{ id: 'x', version: '0.1.0', apiVersion: '99' }] })` is invoked
- **THEN** the engine throws `PluginLoadError: 'Unsupported apiVersion 99 for plugin x'` BEFORE any browser launch

#### Scenario: Duplicate plugin id rejected
- **WHEN** two plugins share the same `id` in the same `plugins[]` array
- **THEN** the engine throws `PluginLoadError: 'Duplicate plugin id'` BEFORE any browser launch

### Requirement: Lifecycle hooks
The engine SHALL invoke plugin hooks in this canonical order per run:
1. `setup(SetupCtx)` (once per measurement, before run 1)
2. For each run: `beforeNavigate` → `onNavigate(navEvent)` → `onLoad` → `onIdle` → repeated `onFrameAttached(frame)` (per attach) → repeated `onMetric(metric)` (per emit) → `beforeReport(reportCtx)`
3. After all runs: `onReport(reportCtx, frozenReport)` → `onShare(shareCtx, frozenReport)` (only if `share` is requested)
4. `teardown(TeardownCtx)` (once, after all runs)

Hooks within the same phase SHALL be invoked in plugin-registration order. The engine SHALL `await` async hooks. The engine SHALL apply a per-hook timeout (default `30000` ms) and SHALL fail the run with `PluginHookTimeout` when exceeded.

#### Scenario: Hook order observed
- **WHEN** a fixture plugin records every hook call with a monotonic counter
- **THEN** the resulting trace shows: `setup` (1×), `beforeNavigate` (N×), `onNavigate` (N×), `onLoad` (N×), `onIdle` (N×), `onMetric` (≥5N×), `beforeReport` (N×), `onReport` (1×), `teardown` (1×)
- **AND** the order respects the canonical ordering above

#### Scenario: Hook timeout
- **WHEN** a plugin's `onLoad` hook returns a promise that never resolves
- **THEN** after `30000` ms the engine throws `PluginHookTimeout: 'plugin <id> hook onLoad timed out'`
- **AND** the run aborts with exit code 8

### Requirement: onMetric transformation
The `onMetric` hook MAY return a `Metric` object. If returned, the engine SHALL replace the original metric with the returned value in the report. Returning `undefined` SHALL leave the metric unchanged.

#### Scenario: Metric transformation
- **WHEN** a plugin's `onMetric` returns `{ ...metric, value: metric.value * 2 }` for `lcp`
- **THEN** the resulting `report.runs[0].metrics.lcp` reflects the doubled value
- **AND** the original value is preserved in the metric's `previousValue` field

### Requirement: Plugin context isolation
Each plugin SHALL receive a `state: Map<string, unknown>` in `RunCtx` that is scoped per-plugin per-run. The engine SHALL NOT share state across plugins or across runs.

#### Scenario: State is per-plugin
- **WHEN** plugin A sets `ctx.state.set('foo', 1)` in `beforeNavigate` and plugin B reads `ctx.state.get('foo')` in the same hook of the same run
- **THEN** plugin B observes `undefined`

### Requirement: Capability declarations
A plugin SHALL declare every capability it intends to use in its `capabilities[]` array. The engine SHALL log every actual capability use to `report.meta.pluginCapabilityUses[]` for audit. v1 SHALL log only; v2+ MAY enforce.

#### Scenario: Capability use logged
- **WHEN** a plugin declares `capabilities: ['network']` and during `onLoad` performs an HTTPS request via `fetch`
- **THEN** `report.meta.pluginCapabilityUses` contains an entry `{ pluginId, capability: 'network', when: 'onLoad' }`

#### Scenario: lowLevel rejected on non-CDP driver
- **WHEN** a plugin declares `capabilities: ['lowLevel']` and is loaded with a non-Chromium Playwright driver (Firefox or WebKit)
- **THEN** the engine refuses to load the plugin and throws `PluginIncompatibleDriver: 'plugin <id> requires lowLevel; driver <id> does not support it'`

### Requirement: In-process execution; npm trust
Plugins SHALL execute in the same Node (or browser) context as the engine. The engine SHALL NOT spawn worker threads, vm contexts, or subprocesses for plugin execution in v1. Trust is delegated to the npm install boundary: users assume the same risk as installing any npm dependency.

#### Scenario: Plugin runs in the engine process
- **WHEN** a plugin's `setup` hook calls `process.pid`
- **THEN** the returned PID equals the engine process's PID

### Requirement: Lockfile integrity (`ohmyperf.lock.json`)
The engine SHALL maintain a project-local `ohmyperf.lock.json` recording every plugin's resolved package name, version, and SRI integrity (`sha384-<base64>`). When CI invokes `ohmyperf` with `--frozen-lockfile`, the engine SHALL refuse to run if the resolved plugin set deviates from the lockfile (different version, different integrity, or new/missing plugins).

#### Scenario: Frozen lockfile blocks drift
- **WHEN** CI runs `ohmyperf --frozen-lockfile <url>` and a plugin's resolved version differs from `ohmyperf.lock.json`
- **THEN** the run aborts with exit code 9 and an explanation listing the drifted plugins

#### Scenario: Lockfile updated on `ohmyperf install`
- **WHEN** the user runs `ohmyperf install` after editing `ohmyperf.config.ts`
- **THEN** `ohmyperf.lock.json` is regenerated to match the new plugin set

### Requirement: Built-in vs third-party plugin trust
Built-in plugins (those shipped under `@ohmyperf/plugins-*`) SHALL load without prompting. Third-party plugins (any other package or relative path) SHALL trigger a one-time interactive trust confirmation per plugin per machine on first use. CI mode SHALL automatically trust everything in the lockfile and SHALL refuse anything outside it.

#### Scenario: First-time third-party prompt (interactive)
- **WHEN** the user runs `ohmyperf <url>` on a TTY for the first time with a third-party plugin in `ohmyperf.config.ts`
- **THEN** the CLI prints the plugin id, version, integrity, and capabilities, and prompts `Trust this plugin? [y/N]`
- **AND** answering `y` records the trust decision in `~/.config/ohmyperf/trust.json`

#### Scenario: CI mode auto-trusts the lockfile
- **WHEN** the CLI runs in non-TTY mode with `--frozen-lockfile` AND every plugin matches the lockfile
- **THEN** no prompt is shown and execution proceeds

### Requirement: Shared reports never re-execute plugins
A shared/exported report (JSON, HTML, hosted-share-link) SHALL be inert data only. The viewer (extension, web, IDE webview, hosted page) SHALL NOT execute any plugin code from the report. Custom UI for plugin data SHALL be limited to known-safe React components shipped with the viewer; v1 SHALL ship zero third-party viewer plugins.

#### Scenario: Shared HTML report contains no executable plugin code
- **WHEN** a report is exported via the HTML reporter and that file is opened by a viewer
- **THEN** the viewer renders only data; no `<script>` tag in the file references or eval-uses plugin source code that came from the report's plugin-data
- **AND** static analysis on the HTML file reveals no `eval(`, `new Function(`, or `import(` against report-controlled strings

#### Scenario: Hosted share viewer rejects unknown plugin UI
- **WHEN** a shared report at `/r/:id` includes `pluginData['some-third-party-id']` whose plugin is not in the viewer's built-in renderer registry
- **THEN** the viewer renders a generic JSON-tree fallback for that plugin's data
- **AND** no third-party code is loaded or executed

### Requirement: Plugin discovery
The engine SHALL discover plugins exclusively from explicit configuration in `ohmyperf.config.ts` (the `plugins` array) or the `plugins` argument to `measure()`. The engine SHALL NOT auto-load plugins by package-name convention or directory scanning in v1.

#### Scenario: Plugin not in config is not loaded
- **WHEN** `@ohmyperf/plugin-cwv` is installed in `node_modules` but not listed in `ohmyperf.config.ts`
- **THEN** measurement runs without invoking that plugin's hooks

### Requirement: Three reference plugins ship with v1
The repository SHALL ship at least three plugins under `packages/plugins-builtin/` that demonstrate the plugin lifecycle and serve as the basis for first-party functionality:
1. `@ohmyperf/plugin-cwv` — CWV collection (LCP/CLS/INP/FCP/TTFB) via `web-vitals/attribution`.
2. `@ohmyperf/plugin-axe` — accessibility audit via `axe-core`.
3. `@ohmyperf/plugin-custom-metric-example` — a documented example showing how to register a user-defined metric.

#### Scenario: Built-ins are discoverable
- **WHEN** a user runs `ohmyperf list-plugins`
- **THEN** the output includes at least the three plugins above with their ids, versions, and capabilities
