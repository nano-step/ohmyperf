# `@ohmyperf/plugins-builtin`

Built-in plugin set for ohmyperf: Core Web Vitals, axe-core accessibility, third-party-web vendor classification.

- Exports `cwvPlugin`, `axePlugin`, `thirdPartiesPlugin`, `customMetricExamplePlugin`.
- Third-party classification via [`third-party-web` v0.29.2](https://github.com/patrickhulce/third-party-web) — categorizes resources by vendor (`gtm`, `analytics`, `ads`, `social`, etc.) with main-thread time + transfer size per vendor.
- Auto-loaded by `@ohmyperf/cli`. Custom plugins follow the `Plugin` interface from `@ohmyperf/core`.

Part of the [ohmyperf](https://github.com/hoainho/ohmyperf) monorepo. Most users install the [`@ohmyperf/cli`](https://www.npmjs.com/package/@ohmyperf/cli) or [`@ohmyperf/mcp-server`](https://www.npmjs.com/package/@ohmyperf/mcp-server) binary rather than this package directly.

## Install

```bash
npm install @ohmyperf/plugins-builtin
```

Requires Node ≥ 22.

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
