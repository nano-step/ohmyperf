# Capability: cli-surface

The `ohmyperf` CLI binary: subcommands, flags, exit codes, CI ergonomics.

## ADDED Requirements

### Requirement: CLI binary
The repository SHALL ship a `bin` named `ohmyperf` exported by `@ohmyperf/cli`. The CLI SHALL be implemented with the `citty` framework. Running `ohmyperf` with no args SHALL print a help banner with a list of subcommands.

#### Scenario: Help text
- **WHEN** the user runs `ohmyperf --help`
- **THEN** the output enumerates at least: `run` (default), `scenario`, `diff`, `share`, `install-browser`, `doctor`, `list-plugins`, `init`
- **AND** the exit code is 0

### Requirement: `run` (default) subcommand
The CLI's default subcommand SHALL accept a single URL positional argument and produce a measurement. Flags supported: `--mode <real|ci-stable>` (default `real`), `--runs <n>` (default 5), `--headless` / `--headful` (default headful in `real`, headless in `ci-stable`), `--output <dir>` (default `./ohmyperf-out`), `--format <list>` (default `json,html`), `--budget <key=value>` (repeatable), `--config <path>` (default `./ohmyperf.config.ts`), `--browser-path <path>`, `--frozen-lockfile`, `--coverage`, `--trace`, `--screenshots`, `--har`, `--share` / `--no-share`, `--allow-single-run`, `--allow-cross-source`, `--unsafe-share-with-secrets`, `--strip-csp`, `--respect-robots`, `--quiet`, `--json` (machine-readable status to stdout), `--project-root <path>`, `--scenario <path>`.

#### Scenario: Smoke run against fixture
- **WHEN** `ohmyperf http://localhost:9999/fixtures/static.html --runs 1 --output /tmp/out` is invoked with `web-vitals` and `axe` plugins enabled
- **THEN** the exit code is 0
- **AND** `/tmp/out/report.json` exists and is valid against the v1.0.0 schema
- **AND** `/tmp/out/report.html` is a self-contained HTML file

### Requirement: Exit codes
The CLI SHALL use the following exit codes (canonical values; SHALL NOT change within `1.x`):

| Code | Meaning |
|---|---|
| 0 | Success; budgets passed (or no budgets evaluated) |
| 1 | Budget failure (any configured budget threshold exceeded) |
| 2 | Invalid CLI usage / config (caught before browser launch) |
| 3 | Browser launch failure |
| 4 | Navigation failure (DNS, connection, timeout, infinite redirect) |
| 5 | Measurement runtime error (renderer crash, OOM) |
| 6 | Plugin load error |
| 7 | OOPIF auto-attach ordering violation |
| 8 | Plugin hook timeout |
| 9 | Frozen-lockfile drift |
| 10 | Share upload refused (env-secret detected, abuse-prevention reject) |
| 11 | Browser binary not installed (use `ohmyperf install-browser`) |
| 12 | Calibration failed in CI Stable mode |

#### Scenario: Budget failure exits 1
- **WHEN** `ohmyperf http://localhost:9999/fixtures/slow.html --budget lcp=500` is invoked and the measured LCP is 2400 ms
- **THEN** the CLI exits with code 1
- **AND** stdout contains a structured `BudgetFailure` summary listing the offending metric, threshold, observed value

#### Scenario: Browser missing exits 11
- **WHEN** the CLI is invoked on a fresh machine where Playwright's browser hasn't been downloaded
- **THEN** the CLI exits with code 11
- **AND** stderr suggests `ohmyperf install-browser`

### Requirement: `scenario` subcommand
`ohmyperf scenario <path-to-ts>` SHALL load a TypeScript file that default-exports a scenario (per the `automation-testing` capability), execute it, and produce a report whose CWV reflects only the steps marked `measure: true`.

#### Scenario: Scenario file executes
- **WHEN** `ohmyperf scenario ./examples/checkout.ts --runs 3` is invoked against a working fixture
- **THEN** the exit code is 0
- **AND** the report's `meta.scenario.name` is `'checkout-flow'`
- **AND** the report's CWV reflects only the steps with `measure: true`

#### Scenario: Scenario with missing env vars
- **WHEN** a scenario reads `process.env.OHMYPERF_USER` and that var is unset
- **AND** the user invokes `ohmyperf scenario ./scenarios/login.ts`
- **THEN** the CLI exits with code 2 BEFORE launching a browser
- **AND** stderr lists the missing env var names

### Requirement: `diff` subcommand
`ohmyperf diff <baseline.json> <candidate.json>` SHALL compare two reports and output a diff document. When N >= 5 runs are present in both reports, the diff SHALL apply a Mann-Whitney U test per metric and SHALL flag a regression only when `p < 0.05` AND the median delta exceeds the metric's noise floor.

#### Scenario: Diff with statistically significant regression
- **WHEN** baseline LCP runs are `[1800, 1820, 1830, 1810, 1825]` and candidate LCP runs are `[2400, 2420, 2410, 2430, 2440]`
- **AND** `ohmyperf diff baseline.json candidate.json` is invoked
- **THEN** the output flags `lcp` as a regression with the Mann-Whitney p-value reported
- **AND** the exit code is 1 (regression detected)

#### Scenario: Diff with noise-floor delta
- **WHEN** baseline and candidate INP medians differ by 5 ms (within noise)
- **THEN** the diff does NOT flag INP as a regression
- **AND** the exit code is 0

### Requirement: `share` subcommand
`ohmyperf share <report.json>` SHALL upload the report to the configured share endpoint and print the resulting short URL to stdout. Before upload the CLI SHALL invoke the redaction pipeline (per the `reporting-and-sharing` capability) and SHALL display a confirmation preview unless `--yes` is passed.

#### Scenario: Successful share
- **WHEN** `ohmyperf share /tmp/out/report.json --yes` is invoked against the configured share endpoint
- **THEN** stdout contains a single line of the form `https://<host>/r/<id>`
- **AND** the exit code is 0
- **AND** the local report file is unchanged (no mutation of the source)

#### Scenario: Share refused due to env-secret
- **WHEN** an env var `STRIPE_KEY=sk_live_abcd` exists in the process environment
- **AND** the report contains the substring `sk_live_abcd` anywhere (header, body, screenshot OCR — no, just structured fields)
- **AND** `ohmyperf share <report>` is invoked
- **THEN** the CLI exits with code 10
- **AND** stderr lists the `(field, location)` pairs where the secret was detected
- **AND** offers `--unsafe-share-with-secrets` as the explicit override

### Requirement: `install-browser` subcommand
`ohmyperf install-browser` SHALL trigger the bundled Playwright browser download for the engine's pinned Chromium revision. The subcommand SHALL be idempotent: re-running on a satisfied install SHALL exit 0 with a "already installed" message.

#### Scenario: Install on fresh machine
- **WHEN** the user runs `ohmyperf install-browser` on a machine where the bundled Chromium is missing
- **THEN** Playwright downloads the pinned revision
- **AND** the subcommand exits 0 on success
- **AND** subsequent `ohmyperf <url>` runs succeed without exit code 11

### Requirement: `doctor` subcommand
`ohmyperf doctor` SHALL print a diagnostic report covering: Node.js version, OS+arch, browser install presence and version, Playwright version, plugin set, lockfile freshness, calibration cache status, and any detected env-vars that may collide with redaction (e.g. `STRIPE_*`, `AWS_*`, `GITHUB_TOKEN`).

#### Scenario: Doctor passes on healthy install
- **WHEN** the user runs `ohmyperf doctor` on a properly set up machine
- **THEN** the exit code is 0
- **AND** stdout contains green checkmarks for: Node, OS, Browser, Playwright, Plugins, Lockfile

### Requirement: `list-plugins` subcommand
`ohmyperf list-plugins` SHALL print the resolved plugin set with id, version, integrity, declared capabilities, and source (built-in vs third-party).

#### Scenario: List output format
- **WHEN** `ohmyperf list-plugins --json` is invoked
- **THEN** stdout is a single JSON array
- **AND** every entry includes keys `{ id, version, integrity, capabilities, source }`

### Requirement: `init` subcommand
`ohmyperf init` SHALL scaffold an `ohmyperf.config.ts`, an example `scenarios/example.ts`, an `ohmyperf.lock.json` placeholder, and a `.github/workflows/ohmyperf.yml` (or equivalent template based on `--ci <github|gitlab|circle>` selection).

#### Scenario: Init in empty repo
- **WHEN** the user runs `ohmyperf init --ci github` in an empty directory
- **THEN** the directory contains `ohmyperf.config.ts`, `scenarios/example.ts`, `.github/workflows/ohmyperf.yml`
- **AND** running `ohmyperf` immediately afterward against an example URL produces a valid report

### Requirement: Single-run-no-budget guard
The CLI SHALL refuse to evaluate budgets when `runs == 1` unless `--allow-single-run` is provided. The refusal SHALL exit code 2 and explain that single-run budget evaluation produces flake.

#### Scenario: Single-run + budget refused
- **WHEN** `ohmyperf <url> --runs 1 --budget lcp=2500` is invoked without `--allow-single-run`
- **THEN** the CLI exits with code 2 BEFORE launching a browser

### Requirement: Watch mode (alpha)
`ohmyperf watch <url>` SHALL re-run the measurement on detected file changes in `--watch-paths` (default: `./src/**/*` and the user-configured paths). Watch mode SHALL be marked `(alpha)` in `--help` and SHALL NOT support budget gates.

#### Scenario: Watch re-runs on save
- **WHEN** the user runs `ohmyperf watch http://localhost:5173/` in a Vite dev project and saves a `.tsx` file
- **THEN** within 1 second a new measurement run starts
- **AND** the result is appended to the running session report
