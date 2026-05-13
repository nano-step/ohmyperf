# Measurement SPA — Deploy Guide

The OhMyPerf SPA (`apps/website/`) is a fully static Next.js export. No server-side rendering required.

## 1. Cloudflare Pages (canonical)

Zero cost on the free tier. Unlimited bandwidth for static assets.

### One-time setup

1. Connect your GitHub repo to Cloudflare Pages.
2. Configure the build:

   | Setting | Value |
   |---------|-------|
   | Framework preset | None (custom) |
   | Build command | `pnpm --filter @ohmyperf/website build` |
   | Build output directory | `apps/website/out` |
   | Root directory | `/` |
   | Node.js version | 22 |

3. Add environment variables if needed (see [Env vars](#env-vars)).
4. Deploy. CF Pages sets `_headers` and `_redirects` from `apps/website/public/` if present.

### Headers (recommended for CSP)

Add `apps/website/public/_headers`:

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

---

## 2. GitHub Pages (alternative)

Add `.github/workflows/pages.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push: { branches: [main] }
jobs:
  deploy:
    runs-on: ubuntu-24.04
    permissions:
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22.x, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @ohmyperf/website build
      - uses: actions/upload-pages-artifact@v3
        with: { path: apps/website/out }
      - uses: actions/deploy-pages@v4
```

If deploying to a sub-path (e.g. `https://user.github.io/ohmyperf/`), set `basePath: '/ohmyperf'` in `apps/website/next.config.mjs`.

---

## 3. Vercel (alternative)

Create `apps/website/vercel.json`:

```json
{
  "outputDirectory": "out",
  "builds": [{ "src": "package.json", "use": "@vercel/static-build" }],
  "routes": [
    { "src": "/report/(.*)", "dest": "/report/index.html" },
    { "src": "/measure/(.*)", "dest": "/measure/index.html" },
    { "src": "/viewer/(.*)", "dest": "/viewer/index.html" }
  ]
}
```

Set `Root Directory` to `apps/website` in the Vercel project settings.

---

## 4. Local runner via docker-compose

```bash
# Clone and start
git clone git@github-personal.com:nhonh/ohmyperf.git
cd ohmyperf
docker compose -f apps/runner/docker-compose.yml up -d

# Verify
curl http://127.0.0.1:5174/api/health
```

The runner binds to `127.0.0.1:5174` by default. The SPA auto-detects it via `/api/health` ping.

---

## 5. Self-hosting runner on a server

For teams or shared CI environments:

1. **Bind to all interfaces** (not just loopback):
   ```bash
   OHMYPERF_RUNNER_BIND=0.0.0.0 docker compose up
   ```

2. **Add a reverse proxy + TLS** (nginx example):
   ```nginx
   server {
     listen 443 ssl;
     server_name runner.example.com;
     location / {
       proxy_pass http://127.0.0.1:5174;
       proxy_set_header Host $host;
     }
   }
   ```

3. **Set CORS allowlist** so the SPA origin is permitted:
   ```bash
   OHMYPERF_RUNNER_CORS_ORIGINS=https://ohmyperf.dev docker compose up
   ```

4. **SSRF caveat**: The runner blocks requests to private/loopback IPs by default. Set `OHMYPERF_RUNNER_ALLOW_PRIVATE=1` only on isolated networks.

5. **Rate limiting**: 10 jobs/hour/IP by default. Adjust via `OHMYPERF_RUNNER_RATE_LIMIT`.

---

## Env vars

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_RUNNER_URL` | `http://127.0.0.1:5174` | Runner base URL shown in backend detector |
| `NEXT_PUBLIC_RUNNER_EXT_ID` | _(unset)_ | Bundled extension ID for externally_connectable |
| `ANALYZE` | `false` | `true` → generate `.next/analyze/` |
| `OMO_TEST_URL` | `http://127.0.0.1:3000` | Playwright test base URL override |
