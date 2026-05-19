# `@ohmyperf/core`

Measurement engine, plugin runtime, calibration, and Mann-Whitney U diff for ohmyperf.

- Public API surface (45 exports) frozen at Schema 1.0.0.
- Contains the engine (`runEngine`), plugin runtime (`PluginHooks`), pre-flight CPU calibration, and Mann-Whitney U significance test for cross-report diff.
- Most users do not depend on `@ohmyperf/core` directly — install [`@ohmyperf/cli`](https://www.npmjs.com/package/@ohmyperf/cli) or [`@ohmyperf/mcp-server`](https://www.npmjs.com/package/@ohmyperf/mcp-server).

Part of the [ohmyperf](https://github.com/hoainho/ohmyperf) monorepo. Most users install the [`@ohmyperf/cli`](https://www.npmjs.com/package/@ohmyperf/cli) or [`@ohmyperf/mcp-server`](https://www.npmjs.com/package/@ohmyperf/mcp-server) binary rather than this package directly.

## Install

```bash
npm install @ohmyperf/core
```

Requires Node ≥ 22.

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
