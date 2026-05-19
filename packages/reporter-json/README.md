# `@ohmyperf/reporter-json`

Canonical JSON reporter for ohmyperf. Schema 1.0.0 source of truth.

- Emits a `report.json` with `schemaVersion: '1.0.0'`. All other reporters consume this shape.
- Stable, frozen public schema — additive changes only.
- Used by every CLI/MCP run by default (`--format=json` is the implicit baseline).

Part of the [ohmyperf](https://github.com/hoainho/ohmyperf) monorepo. Most users install the [`@ohmyperf/cli`](https://www.npmjs.com/package/@ohmyperf/cli) or [`@ohmyperf/mcp-server`](https://www.npmjs.com/package/@ohmyperf/mcp-server) binary rather than this package directly.

## Install

```bash
npm install @ohmyperf/reporter-json
```

Requires Node ≥ 22.

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
