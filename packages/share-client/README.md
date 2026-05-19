# `@ohmyperf/share-client`

Upload + fetch shareable ohmyperf reports. Runs env-secret redaction before upload.

- Scans the report JSON for any env-secret values appearing in URLs, headers, or query params; throws `ShareSecretLeakError` listing the leaked env key names if any are found.
- Default behavior refuses upload unless `--unsafe-share-with-secrets` is passed.
- Compatible with the `@ohmyperf/share-server` backend (Cloudflare Workers + R2 + D1 or Node + S3 + SQLite).

Part of the [ohmyperf](https://github.com/hoainho/ohmyperf) monorepo. Most users install the [`@ohmyperf/cli`](https://www.npmjs.com/package/@ohmyperf/cli) or [`@ohmyperf/mcp-server`](https://www.npmjs.com/package/@ohmyperf/mcp-server) binary rather than this package directly.

## Install

```bash
npm install @ohmyperf/share-client
```

Requires Node ≥ 22.

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
