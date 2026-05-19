# Capability: npm-sdk-surface

The `@ohmyperf/core` public API: stable contract for all downstream surfaces.

## ADDED Requirements

### Requirement: `measure(opts) → Promise<Report>`
`@ohmyperf/core` SHALL export a `measure` function that performs an end-to-end measurement and returns a `Report`. Inputs are validated; invalid inputs throw before any browser launch.

```ts
import type { MeasureOptions, Report } from '@ohmyperf/core';
export function measure(opts: MeasureOptions): Promise<Report>;
```

`MeasureOptions` SHALL include at minimum: `url`, `driver?`, `mode?: 'headless' | 'headful'`, `runs?: number`, `emulation?: EmulationConfig | false`, `scenario?: ScenarioFn | string`, `plugins?: PluginRef[]`, `budgets?: BudgetConfig`, `artifacts?: { trace?: boolean; screenshots?: boolean; har?: boolean; heap?: boolean; coverage?: boolean }`, `output?: { dir: string; formats: ReporterName[] }`, `signal?: AbortSignal`, `hooks?: Partial<EngineHooks>`.

#### Scenario: Returns a valid Report
- **WHEN** `measure({ url: 'http://localhost:9999/fixtures/static.html' })` is invoked
- **THEN** the resolved value's `schemaVersion === '1.0.0'`
- **AND** the value passes the JSON schema for `schemaVersion` `1.0.0` (validated via `report.json schema`)

#### Scenario: Invalid URL fails fast
- **WHEN** `measure({ url: 'not-a-url' })` is invoked
- **THEN** the promise rejects with `MeasureOptionsError` BEFORE any browser launch
- **AND** the rejection's `.cause.field === 'url'`

#### Scenario: AbortSignal honored
- **WHEN** `measure({ url, signal })` is invoked and `signal.abort()` is called mid-run
- **THEN** within 1000 ms the promise rejects with `AbortError`
- **AND** the launched browser is fully closed (no orphan processes)

### Requirement: `defineScenario` helper
`@ohmyperf/core` SHALL export `defineScenario(scenario)` which returns the scenario unchanged but provides full TypeScript inference for `step.run({ page })` against Playwright's `Page` type.

#### Scenario: Type inference works
- **WHEN** a user writes `defineScenario({ steps: [{ name: 's', run: async ({ page }) => page.goto('https://x') }] })` in TypeScript
- **THEN** `page` is typed as `import('playwright').Page`
- **AND** `tsc --noEmit` produces zero errors against the example

### Requirement: `definePlugin` helper
`@ohmyperf/core` SHALL export `definePlugin(plugin)` which returns the plugin unchanged with full type inference on hook signatures.

#### Scenario: Type inference on hooks
- **WHEN** a user writes `definePlugin({ id: 'x', version: '1.0.0', apiVersion: '1', hooks: { onMetric: async (ctx, m) => {} } })`
- **THEN** `ctx` is typed `RunCtx` and `m` is typed `Metric`

### Requirement: `Driver` interface
`@ohmyperf/core` SHALL export a `Driver` interface and SHALL accept any object satisfying it as the `driver` option of `measure`. Drivers SHALL declare capabilities via `supports(capability)` and SHALL expose `browserVersion` as the source of truth.

```ts
export interface Driver {
  readonly id: string;
  readonly browserVersion: string;
  launch(opts: LaunchOpts): Promise<BrowserHandle>;
  newPage(browser: BrowserHandle): Promise<PageHandle>;
  attachCDP?(target: TargetHandle): Promise<CDPSession>;
  supports(capability: DriverCapability): boolean;
}
```

#### Scenario: User can supply a custom Driver
- **WHEN** a user supplies a custom object satisfying `Driver` and the engine asks `driver.supports('cdp-oopif') === false`
- **THEN** the engine logs `degraded: true, reason: 'driver-no-cdp-oopif'` in `report.meta.degradations`
- **AND** the run completes with frame-tree containing only the root frame

### Requirement: `Report` shape
The `Report` type SHALL be exported from `@ohmyperf/core/types` and SHALL include at minimum: `schemaVersion`, `meta`, `runs[]`, `aggregated`, `frames`, `audits[]`, `budgets?`, `artifacts`, `pluginData`. The shape SHALL be JSON-serializable (no functions, no circular references, no class instances).

#### Scenario: Report round-trips through JSON
- **WHEN** any returned report is `JSON.stringify`'d and `JSON.parse`'d back
- **THEN** the parsed value `deep-equal`s the original

### Requirement: No CDP types in public API
The `@ohmyperf/core` public API SHALL NOT expose any types from `playwright/types/protocol`, `chrome-remote-interface`, or `puppeteer-core/protocol`. CDP shapes used internally SHALL be translated to neutral domain types (`FrameNode`, `Metric`, `LongTask`, `Resource`, etc.) at the boundary.

#### Scenario: API surface free of CDP types
- **WHEN** `tsc --noEmit --strict` is run against a consumer project that imports only from `@ohmyperf/core`
- **THEN** no symbol named with prefix `Protocol.` appears in the project's resolved type graph for `@ohmyperf/core` exports

### Requirement: API frozen at P0/P1 boundary
At the end of P0 the public API surface of `@ohmyperf/core` SHALL be marked `1.0.0-stable` and recorded in `docs/api-contract-1.0.md`. Subsequent additions SHALL be additive only within the `1.x` major. Breaking changes SHALL bump to `2.0.0` and SHALL trigger cross-surface impact review.

#### Scenario: API drift caught in CI
- **WHEN** a PR removes or renames an exported symbol from `@ohmyperf/core`
- **AND** the PR does not bump `@ohmyperf/core` to `2.0.0`
- **THEN** the `api-extractor` CI step fails with a list of breaking exports

### Requirement: Reentrant — no globals/singletons
The engine core SHALL be reentrant. Multiple concurrent `measure()` calls in the same process SHALL NOT share mutable state. The engine SHALL NOT use module-level mutable globals or singletons in `@ohmyperf/core`.

#### Scenario: Two concurrent measure calls
- **WHEN** two `measure({ url, runs: 1 })` calls are awaited in `Promise.all([m1, m2])` against two different fixtures
- **THEN** both reports are returned successfully and have distinct `meta.measurementId` values
- **AND** no shared state corrupts either report

### Requirement: Browser build target
`@ohmyperf/core` SHALL provide a browser-targeted build (`exports.browser`) that omits Node-only APIs (`fs`, `path`, child-process spawn) so the package can be bundled into the Chrome extension's service-worker context.

#### Scenario: Browser bundle excludes fs
- **WHEN** a Vite build of the Chrome extension imports `@ohmyperf/core` (browser target)
- **THEN** the resulting bundle does NOT include `node:fs` or any direct `fs` requires
- **AND** the bundle is < 500 KB minified+gzipped (excluding the `web-vitals` payload)
