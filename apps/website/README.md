# @ohmyperf/website

Next.js 15 static-export SPA: landing, measurement flow, drag-drop viewer, report history.

## Quickstart

```bash
# from repo root
pnpm install
pnpm --filter @ohmyperf/website dev
# → http://localhost:3000
```

## Scripts

| Script | Description |
|--------|-------------|
| `dev` | Next.js dev server on :3000 |
| `build` | Static export to `out/` |
| `start` | Serve built output (`next start`) |
| `typecheck` | `tsc --noEmit` |
| `lint` | `next lint --max-warnings=0` |
| `test` | Vitest unit tests |
| `test:a11y` | Playwright axe-core a11y tests (requires build or running dev server) |
| `test:smoke` | Playwright smoke tests |
| `analyze` | Bundle analysis (`ANALYZE=true next build`) |
| `clean` | Remove `.next/`, `out/`, build caches |

## Env vars

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_RUNNER_URL` | `http://127.0.0.1:5174` | Local runner base URL |
| `NEXT_PUBLIC_RUNNER_EXT_ID` | _(unset)_ | Chrome extension ID for external connect |
| `ANALYZE` | `false` | Set to `true` to generate bundle analysis report |
| `OMO_TEST_URL` | `http://127.0.0.1:3000` | Override base URL for Playwright tests |

## Deploy targets

### Cloudflare Pages (canonical)

```
Build command: pnpm --filter @ohmyperf/website build
Build output:  apps/website/out
Node version:  22
```

No server required — fully static export. CF Pages free tier supports the zero-cloud-cost goal.

### GitHub Pages (alternative)

Use `.github/workflows/website-budgets.yml` as a starting point. Set `basePath` in `next.config.mjs` if not serving from root.

### Vercel (alternative)

Add `vercel.json` at `apps/website/`:

```json
{
  "outputDirectory": "out",
  "builds": [{ "src": "package.json", "use": "@vercel/static-build" }],
  "routes": [{ "src": "/report/(.*)", "dest": "/report/index.html" }]
}
```

### Local development

```bash
pnpm --filter @ohmyperf/website dev
# optionally run the local runner:
docker compose -f apps/runner/docker-compose.yml up -d
```

## Testing

### Unit / vitest

```bash
pnpm --filter @ohmyperf/website test
```

### a11y (deferred to local run — Playwright browsers not available in sandbox)

```bash
pnpm --filter @ohmyperf/website build
pnpm --filter @ohmyperf/website test:a11y
```

### Dogfood policy

The `dogfood.yml` CI workflow builds the SPA, serves it on `:4173` via `http-server`, and runs the CLI against itself weekly (Monday 06:00 UTC) and on PRs touching `apps/website/`, `packages/viewer/`, or `packages/core/`. Thresholds: LCP < 2500ms, INP < 200ms, CLS < 0.10.

## Troubleshooting

**"No backend detected"** — Install the Chrome extension (unpacked from `apps/extension-chrome/`) or start the local runner (`docker compose up`).

**IDB quota exceeded** — Reports stored locally in IndexedDB (200 MB limit). Visit `/report` and clear old reports.

**PNA / CORS blocked** — Ensure `OHMYPERF_RUNNER_ORIGIN` on the runner includes this origin. For local dev the runner binds to `127.0.0.1:5174` and the SPA is on `127.0.0.1:3000` — PNA headers are handled by the runner middleware.
