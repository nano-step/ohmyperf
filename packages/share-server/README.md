# @ohmyperf/share-server

Hono backend for shareable links. Two adapters share a single Hono app:

- **Cloudflare Workers** (`src/workers.ts`) — R2 for report blobs, D1 for records.
- **Node self-host** (`src/node.ts`) — filesystem under `.ohmyperf-share-data/`.

## Layout

```
src/
├── app.ts        — Hono app with routes (POST /api/share, GET /r/:id, GET /api/r/:id, DELETE)
├── storage.ts    — ShareStorage interface + InMemoryStorage (for tests)
├── node.ts       — Node adapter, filesystem storage
└── workers.ts    — Cloudflare Workers adapter, R2 + D1 storage + D1_SCHEMA
```

## CI strategy

Unit tests use `InMemoryStorage` (`src/app.test.ts`) and run on every PR via the standard `matrix` job in `.github/workflows/ci.yml`. This covers Hono routing, rate limiting, redaction, password hashing, and expiry logic.

The Workers adapter (`workers.ts`) is **not** exercised in CI — R2 and D1 bindings cannot be reliably mocked without a Cloudflare account or `miniflare`. The adapter is intentionally a thin shim over `app.ts`; the routing/business logic is the same code path tested in unit tests.

Workers deploy is smoke-tested manually before release: run `wrangler deploy` against a staging worker, curl the four endpoints, verify D1 row + R2 object lifecycle. Consider adding [`miniflare`](https://miniflare.dev) integration tests if Workers adapter complexity grows beyond the current thin shim.

## Deploy

See [`docs/measurement-spa-deploy.md`](../../docs/measurement-spa-deploy.md) for the Cloudflare Workers + R2 + D1 deploy walkthrough.

## Status

See [`openspec/`](../../openspec) for the proposal that drives this package. Track C ships the wrangler config + migrations; the actual `wrangler deploy` is a user-driven step (C9.5).
