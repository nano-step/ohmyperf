# @ohmyperf/eslint-plugin

ESLint rules that flag client-side performance anti-patterns linked to Core Web Vitals.

The shift-left companion to [`@ohmyperf/cli`](https://www.npmjs.com/package/@ohmyperf/cli): the CLI measures, the ESLint plugin prevents.

## Install

```bash
npm install --save-dev @ohmyperf/eslint-plugin
```

## Usage (flat config, ESLint 9+)

```js
// eslint.config.js
import ohmyperf from "@ohmyperf/eslint-plugin";

export default [
  ohmyperf.configs.recommended,
];
```

## Usage (legacy `.eslintrc`)

```json
{
  "plugins": ["ohmyperf"],
  "extends": ["plugin:ohmyperf/legacy-recommended"]
}
```

## Rules

| Rule | Default | Metrics | What it catches |
|---|---|---|---|
| `no-document-write` | `error` | LCP, FCP | `document.write()` / `document.writeln()` block parsing |
| `no-sync-xhr` | `error` | INP, TBT | `xhr.open(..., async=false)` blocks the main thread |
| `no-large-inline-data-url` | `warn` | LCP, FCP | `<img>` / `<iframe>` with inline `data:` URL > 4KB |
| `prefer-loading-lazy` | `warn` | LCP | `<img>` / `<iframe>` missing `loading` attribute |
| `prefer-fetchpriority` | `warn` | LCP | `<img>` marked `priority`/`data-hero` without `fetchpriority="high"` |
| `no-render-blocking-script-in-head` | `warn` | LCP, FCP | `<script src>` without `async`/`defer`/`type="module"` |
| `no-passive-event-violation` | `warn` | INP | `addEventListener('touchstart'\|'wheel'\|'scroll', …)` without `{ passive: true }` |

## License

Apache-2.0
