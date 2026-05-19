# `@ohmyperf/reporter-html`

Self-contained HTML reporter for ohmyperf. Wraps `@ohmyperf/viewer`.

- Adds the Node-side file writer + drag-drop UI wiring around the pure `@ohmyperf/viewer` HTML renderer.
- Zero CDN, embedded JSON payload, `<meta name='referrer' content='no-referrer'>` for privacy.
- Output: single `report.html` you can email, commit, or attach to a GitHub issue.

Part of the [ohmyperf](https://github.com/hoainho/ohmyperf) monorepo. Most users install the [`@ohmyperf/cli`](https://www.npmjs.com/package/@ohmyperf/cli) or [`@ohmyperf/mcp-server`](https://www.npmjs.com/package/@ohmyperf/mcp-server) binary rather than this package directly.

## Install

```bash
npm install @ohmyperf/reporter-html
```

Requires Node ≥ 22.

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
