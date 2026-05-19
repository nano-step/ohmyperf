# Spec: Share + Export UI + Visual Identity

## ADDED Requirements

### Requirement: Report page must include a Share button
The `/report/?id=<id>` route SHALL render a Share button in the toolbar.

#### Scenario: Share button is visible
- **WHEN** the user navigates to `/report/?id=<id>`
- **THEN** the rendered DOM contains an element with `data-testid="share-button"`

#### Scenario: Share with configured endpoint uploads and copies URL
- **WHEN** `NEXT_PUBLIC_SHARE_ENDPOINT` is set to a valid share-server URL
- **AND** the user clicks Share
- **THEN** the SPA calls `uploadReport({ endpoint, report })` from `@ohmyperf/share-client`
- **AND** on success, the returned `url` is written to `navigator.clipboard`
- **AND** a success toast appears showing the URL

#### Scenario: Share without endpoint shows help
- **WHEN** `NEXT_PUBLIC_SHARE_ENDPOINT` is unset
- **AND** the user clicks Share
- **THEN** a popover appears with instructions to set the env var
- **AND** the popover links to `docs/measurement-spa-deploy.md`
- **AND** no network request is made

#### Scenario: ShareSecretLeakError surfaces a confirm dialog (defensive path)
- **WHEN** a test harness mocks `redaction.scanEnvSecrets()` to return `['ENV_SECRET_KEY']` (or the same code path is exercised via CLI where `process.env` is real)
- **AND** the user clicks Share
- **THEN** an AlertDialog appears listing the leaked keys
- **AND** the user can choose "Cancel" or "Share anyway (unsafe)"
- **AND** "Share anyway" re-invokes `uploadReport` with `skipRedaction: true`

**Note**: This dialog cannot fire in production SPA because Next.js polyfills `process.env = {}` in the browser, so `scanEnvSecrets()` always returns `[]`. The dialog code is defensive — it exists for future hardening (e.g., a "scan visible URLs for tokens" mode) and for parity with the CLI path where `process.env` IS real.

### Requirement: Report page must include an Export menu
The Report toolbar SHALL include a DropdownMenu with four export actions.

#### Scenario: Export menu has four items
- **WHEN** the user opens the Export menu
- **THEN** the menu items in order are: "Download JSON", "Download Markdown", "Copy as JSON", "Copy as Markdown"

#### Scenario: Download JSON saves a file
- **WHEN** the user clicks "Download JSON"
- **THEN** the browser receives a Blob of MIME type `application/json`
- **AND** the suggested filename is `ohmyperf-<reportId>.json`

#### Scenario: Copy as Markdown puts markdown in clipboard
- **WHEN** the user clicks "Copy as Markdown"
- **THEN** `navigator.clipboard.readText()` returns a string starting with `# OhMyPerf Report` (or the markdown reporter's H1)
- **AND** a toast confirms "Copied as Markdown"

#### Scenario: Export works offline
- **WHEN** the user is offline (no network)
- **AND** clicks any Export menu item
- **THEN** the operation succeeds (no network required for JSON/Markdown export)

### Requirement: Site header must show share endpoint status
The site header SHALL display a small pill indicating whether the share endpoint is configured.

#### Scenario: Endpoint configured
- **WHEN** `NEXT_PUBLIC_SHARE_ENDPOINT` is set
- **THEN** the header pill reads "Share: connected" with a positive visual treatment

#### Scenario: Endpoint not configured
- **WHEN** `NEXT_PUBLIC_SHARE_ENDPOINT` is unset
- **THEN** the header pill reads "Share: not configured" and links to the deploy docs

### Requirement: SPA palette must include brand accent hues
The `@theme` block in `globals.css` SHALL define `--color-accent-primary`, `--color-accent-success`, `--color-accent-warning`, `--color-accent-danger` (and dark counterparts).

#### Scenario: Accent variables are defined
- **WHEN** the SPA builds
- **THEN** computed style on `:root` includes the four `--color-accent-*` custom properties
- **AND** each evaluates to a valid OKLCH color

#### Scenario: Existing rating colors derive from CSS vars
- **WHEN** a metric renders with rating "good"
- **THEN** its color resolves to `var(--color-accent-success)`, not the hard-coded `#0cce6b`

#### Scenario: New palette passes WCAG 2.1 AA contrast on key surfaces
- **WHEN** `pnpm test:a11y` runs
- **THEN** zero new color-contrast violations appear vs the prior baseline
- **AND** primary buttons, metric tiles, and badges all pass 4.5:1 (or 3:1 for large text)

### Requirement: ReportViewer must use shadcn primitives
The `ReportViewer` component SHALL render each major section inside a shadcn `Card` (`CardHeader` + `CardContent`), and replace raw HTML tables with shadcn `Table` primitives where applicable.

#### Scenario: Cards wrap each section
- **WHEN** the Report screen renders
- **THEN** the DOM contains `Card` elements wrapping: meta header, variance banner, metric tiles, audits list, resources table, frame tree, runs table

### Requirement: Orphan components must be wired in
The following `components/metrics/` components SHALL be imported by `ReportViewer`: `Waterfall`, `FrameTree`, `VarianceBanner`.

#### Scenario: Waterfall renders inside the resources section
- **WHEN** a Report with > 0 resources is loaded
- **THEN** the DOM contains the `Waterfall` chart inside the resources section

#### Scenario: FrameTree has working collapse toggle
- **WHEN** the user clicks the collapse caret on the frame tree
- **THEN** the child frames hide
- **AND** clicking again restores them

#### Scenario: VarianceBanner replaces inline banner
- **WHEN** a Report has CoV > 20% on any CWV
- **THEN** the rendered banner element is from `components/metrics/variance-banner.tsx`, not the previous inline `UnstableBanner`

### Requirement: share-server must ship a wrangler.toml
`packages/share-server/wrangler.toml` SHALL exist with placeholder bindings for D1 + R2 (single committed file with `REPLACE_AFTER_wrangler_d1_create` placeholders + inline comments — no separate `wrangler.example.toml`).

#### Scenario: wrangler.toml exists
- **WHEN** a self-hoster clones the repo
- **THEN** `packages/share-server/wrangler.toml` exists with a clear `REPLACE_AFTER_wrangler_d1_create` placeholder for the D1 database_id

#### Scenario: Migration SQL is committed
- **WHEN** a self-hoster runs `wrangler d1 migrations apply ohmyperf-share-prod`
- **THEN** the migration file `migrations/0001_initial.sql` applies cleanly
- **AND** the resulting schema matches `D1_SCHEMA` from `workers.ts`

### Requirement: Bundle budget for /report/[[...id]] must remain under 250 KB gzip
The SPA `/report/[[...id]]` route (the key used in `scripts/bundle-budgets.json`) SHALL stay under 250 KB First Load JS (gzipped) after adding share-client + the new toolbar + shadcn refactor.

#### Scenario: Bundle budget check passes
- **WHEN** `pnpm --filter @ohmyperf/website analyze:check` runs after this change
- **THEN** the `/report/[[...id]]` route bundle is ≤ 250 KB gzip
- **AND** the existing CI gate (`.github/workflows/website-budgets.yml` running `scripts/check-bundle-budgets.mjs`) fails the build on overage
