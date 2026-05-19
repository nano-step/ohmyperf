# `@ohmyperf/driver-playwright`

Playwright + Chrome DevTools Protocol driver for ohmyperf. Includes OOPIF (cross-origin iframe) deep-inspection.

- Wraps Playwright's `newCDPSession()` to expose a `CDPSessionLike` interface to the ohmyperf engine.
- `./oopif-attach` entry point installs `Target.setAutoAttach({ flatten: true })` — attaches a real CDPSession to every cross-origin iframe, srcdoc frame, fenced frame, and popup. ~99% iframe metric coverage.
- Standard `driver-playwright` plus `cdp-compat` subpath for advanced Chromium work.

Part of the [ohmyperf](https://github.com/hoainho/ohmyperf) monorepo. Most users install the [`@ohmyperf/cli`](https://www.npmjs.com/package/@ohmyperf/cli) or [`@ohmyperf/mcp-server`](https://www.npmjs.com/package/@ohmyperf/mcp-server) binary rather than this package directly.

## Install

```bash
npm install @ohmyperf/driver-playwright
```

Requires Node ≥ 22.

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
