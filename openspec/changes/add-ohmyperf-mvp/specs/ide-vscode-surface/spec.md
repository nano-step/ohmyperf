# Capability: ide-vscode-surface

The VSCode extension that integrates `ohmyperf` into the editor.

## ADDED Requirements

### Requirement: Extension package
The repository SHALL ship an `apps/ide-vscode/` package that builds a VSCode extension named `ohmyperf` (publisher: the verified `ohmyperf` org, decided during P0 marketplace audit). The extension SHALL declare `engines.vscode: '^1.85.0'` (or a minimum supported VSCode version determined during P3) and SHALL NOT bundle a Node.js runtime — it inherits VSCode's bundled Node.

#### Scenario: Extension installable
- **WHEN** the published `.vsix` is installed via `code --install-extension ohmyperf-<version>.vsix`
- **THEN** VSCode reports the extension is enabled
- **AND** the extension activates lazily on the registered commands (cold-start activation < 500 ms)

### Requirement: `Measure URL` command
The extension SHALL register a command `OhMyPerf: Measure URL` (palette and right-click on a URL string in the editor) that prompts for/uses the URL, spawns the `ohmyperf` CLI as a subprocess (`@ohmyperf/cli`), streams progress to a status-bar item, and on completion opens a webview hosting the `@ohmyperf/viewer` package with the resulting report.

#### Scenario: Palette → measure
- **WHEN** the user invokes `OhMyPerf: Measure URL` from the palette and enters `http://localhost:5173/`
- **THEN** the status bar shows `OhMyPerf: running (1/5)`, then `(2/5)`... until completion
- **AND** on completion a webview opens titled `OhMyPerf — http://localhost:5173/`
- **AND** the webview renders the same panels as the HTML reporter

### Requirement: CLI subprocess management
The extension SHALL locate the `ohmyperf` binary via (in order): `${workspaceFolder}/node_modules/.bin/ohmyperf`, the user's `OHMYPERF_BIN` setting, the global `ohmyperf` on PATH. If none are found, the extension SHALL surface a notification with a "Install" button that runs `npm install -D @ohmyperf/cli` in the workspace.

#### Scenario: CLI auto-located in workspace
- **WHEN** a workspace has `@ohmyperf/cli` as a devDependency
- **THEN** the extension uses `${workspaceFolder}/node_modules/.bin/ohmyperf`

#### Scenario: CLI missing prompts install
- **WHEN** the workspace has no `@ohmyperf/cli` and no global `ohmyperf` on PATH
- **THEN** invoking `OhMyPerf: Measure URL` shows a notification with an "Install" action button
- **AND** clicking the button triggers `npm install -D @ohmyperf/cli` in the workspace's terminal

### Requirement: Source-map decorations
On report completion, when the report's `sourceAttribution` section maps metric data to source files in the workspace, the extension SHALL place `editor.decorations` and `CodeLens` on the affected lines:
- Gutter decoration with severity (info / warning) for unused-bytes thresholds (warn ≥ 50 KB, info < 50 KB).
- CodeLens "47 KB unused — 3.2s eval — 1 long task at ms=1240".

The extension SHALL NOT crash or render decorations when source maps are unavailable; it SHALL log "no source maps for <url>" once per run and proceed.

#### Scenario: Decorations on workspace file
- **WHEN** measurement runs against a Vite dev server in the workspace and the resulting report's `sourceAttribution[/src/heavy.tsx].unusedBytes === 60000`
- **THEN** opening `/src/heavy.tsx` shows a gutter warning at line 1 and a CodeLens with the unused-byte summary

#### Scenario: No source maps does not crash
- **WHEN** the report has no `sourceAttribution` data
- **THEN** the extension renders the webview report normally with no decorations
- **AND** an informational status-bar message appears: "OhMyPerf: source maps not available for this run"

### Requirement: `Measure on save` (optional setting)
The extension SHALL expose a setting `ohmyperf.measureOnSave` (default `false`). When enabled, on save of a file matching `ohmyperf.watchPaths` (default `**/*.{ts,tsx,js,jsx,vue,svelte}`), the extension SHALL re-run the most recent measurement command after a 500 ms debounce.

#### Scenario: Save re-measures when enabled
- **WHEN** `ohmyperf.measureOnSave: true` AND a previous measurement targets `http://localhost:5173/`
- **AND** the user saves `src/App.tsx`
- **THEN** within 600 ms a new measurement starts against the same URL

### Requirement: Webview content security
The webview SHALL set a strict Content-Security-Policy that disallows `eval`, inline `<script>` execution from the report (the report payload is delivered as JSON via `postMessage`, never as inline script), and limits `connect-src` to the share endpoint when the user is sharing.

#### Scenario: Webview CSP blocks eval
- **WHEN** the webview opens with a report
- **THEN** the response sets `Content-Security-Policy` containing `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src https://ohmyperf.dev https://*.r2.cloudflarestorage.com`
- **AND** an attempt to execute `eval('1+1')` in the webview console fails with a CSP violation

### Requirement: Settings surface
The extension SHALL expose VSCode settings (in `package.json` `contributes.configuration`):
- `ohmyperf.binPath`: explicit path to the `ohmyperf` binary.
- `ohmyperf.defaultUrl`: URL pre-filled in the command palette prompt.
- `ohmyperf.runsPerMeasurement`: default 5.
- `ohmyperf.mode`: `'real' | 'ci-stable'` (default `'real'`).
- `ohmyperf.measureOnSave`: boolean (default `false`).
- `ohmyperf.watchPaths`: glob array.
- `ohmyperf.projectRoot`: defaults to `${workspaceFolder}`.
- `ohmyperf.share.endpoint`: optional URL override.

#### Scenario: Settings discoverable
- **WHEN** the user opens VSCode settings UI and searches `ohmyperf`
- **THEN** all the documented settings appear with descriptions

### Requirement: SecretStorage for credentials
When a scenario requires environment-variable secrets (e.g. `OHMYPERF_USER`, `OHMYPERF_PASS`), the extension SHALL use VSCode's `SecretStorage` API to store user-entered values. The extension SHALL NOT write secrets to settings, workspace state, or any file.

#### Scenario: Secret stored in SecretStorage
- **WHEN** the user runs a scenario that needs `OHMYPERF_PASS` and the env var is not present
- **THEN** the extension prompts via VSCode's password input
- **AND** stores the entry in `vscode.SecretStorage` under a namespaced key (e.g. `ohmyperf.scenario.<workspace-hash>.OHMYPERF_PASS`)
- **AND** does NOT write the secret to any other location

### Requirement: MVP scope only
v1 SHALL implement: (1) `Measure URL` command, (2) source-map decorations + CodeLens, (3) optional `measure on save`, (4) settings, (5) SecretStorage for scenario secrets, (6) webview viewer. v1 SHALL NOT include: inline budget configuration UI, plugin marketplace UI, multi-target dashboards, AI suggestions. These are deferred.

#### Scenario: No plugin marketplace UI in v1
- **WHEN** the user inspects the extension's commands and views in VSCode's UI
- **THEN** there is no "Browse plugins" or "Marketplace" command
