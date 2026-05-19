# Capability: automation-testing

Scenario scripting (TS), budgets, diff with significance tests, CI templates, lockfile-frozen integrity.

## ADDED Requirements

### Requirement: Scenario file format (TypeScript)
A scenario file SHALL be a TypeScript module that default-exports the result of `defineScenario({ name, steps })`. Each step has `{ name: string, run: ({ page, context, env }) => Promise<void>, measure?: boolean, timeout?: number }`. The engine SHALL execute steps sequentially. CWV reported in the final report SHALL be aggregated from steps where `measure === true`.

#### Scenario: Multi-step scenario executes
- **WHEN** the user runs `ohmyperf scenario ./examples/checkout.ts --runs 3` against a working fixture with 3 steps (one setup, two `measure: true`)
- **THEN** the report's `meta.scenario.steps[]` lists all 3 steps with their durations
- **AND** the CWV in `report.aggregated` reflects only the `measure: true` steps

#### Scenario: Step timeout enforced
- **WHEN** a step has `timeout: 5000` and runs for 6 seconds
- **THEN** the run aborts with exit code 4
- **AND** stderr indicates which step exceeded the timeout

### Requirement: Budgets
Budgets SHALL be configurable per-metric. Supported syntax in `ohmyperf.config.ts`:

```ts
export default defineConfig({
  budgets: {
    lcp: 2500,                    // <= 2500 ms
    cls: 0.1,                     // <= 0.1
    inp: 200,                     // <= 200 ms
    'unused-js-bytes': 50_000,    // <= 50 KB
    'a11y-violations': 0,         // <= 0 violations
    custom: { 'my-metric': 100 }, // for plugin-defined metrics
  },
});
```

CLI overrides via repeated `--budget metric=threshold`. Budget evaluation SHALL run after aggregation. The CLI SHALL exit with code 1 when any budget threshold is exceeded; budget metadata SHALL appear in `report.budgets[]` with `{ metric, threshold, observed, passed }`.

#### Scenario: Budget pass
- **WHEN** measured LCP (median) is 1800 ms and the configured budget is `lcp: 2500`
- **THEN** the CLI exits 0
- **AND** `report.budgets[]` contains `{ metric: 'lcp', threshold: 2500, observed: 1800, passed: true }`

#### Scenario: Budget fail with structured output
- **WHEN** measured LCP (median) is 2800 ms and the configured budget is `lcp: 2500`
- **THEN** the CLI exits 1
- **AND** `report.budgets[].find(b => b.metric === 'lcp').passed === false`
- **AND** stdout contains a one-line `BudgetFailure: lcp 2800 > 2500`

### Requirement: Diff with statistical significance
`ohmyperf diff <baseline.json> <candidate.json>` SHALL apply a Mann-Whitney U test per metric using the per-run values from both reports. Regression flags SHALL require BOTH `p < 0.05` AND `|median_delta| > metric_noise_floor` (per-metric noise floors documented in `docs/diff-noise-floors.md`). The output SHALL include median delta, p-value, U-statistic, sample sizes, and pass/fail flag per metric.

#### Scenario: Statistically significant regression
- **WHEN** baseline LCP runs are `[1800, 1820, 1830, 1810, 1825]` and candidate `[2400, 2420, 2410, 2430, 2440]`
- **THEN** `ohmyperf diff <baseline> <candidate>` reports `lcp` regression with p-value < 0.05 and median delta > noise floor
- **AND** the CLI exits 1

#### Scenario: Insignificant difference
- **WHEN** baseline INP runs are `[120, 130, 125, 135, 128]` and candidate `[131, 121, 134, 130, 124]`
- **THEN** the diff reports INP `passed: true` despite the small per-run shuffle
- **AND** the CLI exits 0

### Requirement: CI templates
The repo SHALL ship copy-pasteable CI templates under `templates/ci/`:
- `github-actions.yml`
- `gitlab-ci.yml`
- `circleci-config.yml`

Each template SHALL: install `@ohmyperf/cli`, install the bundled browser, run `ohmyperf <url> --mode ci-stable --frozen-lockfile --output ./ohmyperf-out --format json,html,junit`, upload the `ohmyperf-out/` directory as a build artifact, optionally publish a JUnit summary.

#### Scenario: GitHub Actions template usable
- **WHEN** a repo copies `templates/ci/github-actions.yml` and replaces `${URL}`
- **THEN** the resulting workflow runs on push and produces an artifact directory
- **AND** any budget failure causes the workflow to fail

### Requirement: Frozen-lockfile integrity in CI
CI templates SHALL pass `--frozen-lockfile` and SHALL fail when plugin-set drift is detected (per `plugin-system` capability).

#### Scenario: Lockfile drift fails CI
- **WHEN** a PR adds a plugin to `ohmyperf.config.ts` but does not update `ohmyperf.lock.json`
- **THEN** the CI run exits 9 (frozen-lockfile drift)

### Requirement: Single-run-no-budget guard
The CLI SHALL refuse to evaluate budgets when only one run is configured, unless `--allow-single-run` is provided. The refusal SHALL produce a clear message explaining single-run flake.

#### Scenario: Single-run + budget refused
- **WHEN** `ohmyperf <url> --runs 1 --budget lcp=2500` is invoked
- **THEN** the CLI exits 2 BEFORE launching a browser
- **AND** stderr suggests `--allow-single-run` and explains the variance risk

### Requirement: Cross-source compare guard
The `diff` subcommand SHALL refuse to compare reports whose `meta.browser.source` values differ (e.g. `bundled` vs `extension-host`) unless `--allow-cross-source` is provided.

#### Scenario: Cross-source diff refused
- **WHEN** baseline.json was produced by the bundled Playwright Chromium and candidate.json was produced by the Chrome extension
- **THEN** `ohmyperf diff baseline.json candidate.json` exits 2 with a message about source mismatch

### Requirement: Watch mode (alpha)
`ohmyperf watch <url>` SHALL re-run the latest measurement on file-system changes within `ohmyperf.watchPaths`. Watch mode SHALL NOT enforce budgets. Watch SHALL be marked `(alpha)` in `--help`.

#### Scenario: File save triggers re-run
- **WHEN** the user runs `ohmyperf watch http://localhost:5173/` in a Vite project and saves `src/App.tsx`
- **THEN** within 1000 ms a new measurement run starts
- **AND** the running session report is updated incrementally

### Requirement: Multi-page crawl mode (alpha)
The CLI SHALL accept `ohmyperf crawl <seed-url> --max-pages 20 --depth 2 --sitemap-url <optional>` to measure multiple pages in one invocation. Crawl mode SHALL be marked `(alpha)` and SHALL run measurements serially by default (concurrency `1`) per the engine's accuracy default.

#### Scenario: Crawl produces one report per page
- **WHEN** `ohmyperf crawl http://localhost:9999/site1/ --max-pages 5` is invoked
- **THEN** the output dir contains a top-level `crawl.json` that indexes per-page subdirectories `pages/<urlhash>/report.json`
- **AND** each page's report is independently valid against the v1.0.0 schema
