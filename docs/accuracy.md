# Accuracy

OhMyPerf measures real Core Web Vitals on real Chromium using the same observers a browser uses for its built-in metrics. Where possible we cross-check the numbers against Lighthouse 13.x on a fixture set kept in `tests/parity/`.

## What's validated

| Metric | Bound | Source | Status |
|---|---|---|---|
| LCP | ±10% relative to Lighthouse 13.x median (≥30ms floor) | `tests/parity/lighthouse-parity.test.ts` | enforced |
| FCP | ±10% relative to Lighthouse 13.x median (≥30ms floor) | `tests/parity/lighthouse-parity.test.ts` | enforced |
| TTFB | ±10% relative to Lighthouse 13.x median (≥30ms floor) | `tests/parity/lighthouse-parity.test.ts` | enforced |
| TBT | ±15% relative to Lighthouse, tightening to ±5% once trace-based long-tasks land | Track B `tests/parity/tbt-parity.test.ts` | scheduled |
| INP | identical to `web-vitals/attribution` reference within ±2ms | `tests/oopif-corpus` engine tests | enforced post-Track-A |
| CLS | identical to `web-vitals/attribution` reference within float epsilon | `tests/oopif-corpus` engine tests | enforced post-Track-A |

INP and CLS are not compared against Lighthouse — the two tools should agree by construction because both delegate to the official `web-vitals` library since OhMyPerf v1.

## How parity is measured

`pnpm test:parity` (gated, not in default `pnpm test`):

1. Starts a local HTTP server serving the three fixtures under `tests/parity/fixtures/`.
2. Launches OhMyPerf via `runEngine` (3 runs, real mode, `cwvPlugin`).
3. Launches a **separate** Chromium instance on a free `--remote-debugging-port` and runs Lighthouse 13.x (`output: 'json'`, `onlyCategories: ['performance']`) against the same URL. Two separate Chromium instances avoid CDP `Page`/`Network` attach conflicts that would arise from sharing one session.
4. For each metric, asserts `|ours − lh| / lh` is within the published tolerance.
5. Cleans up both browsers and the server.

CI runs the parity suite only on `main` pushes (see `parity` job in `.github/workflows/ci.yml`) to avoid burning ~60s on every PR while still catching drift before release.

## Known deltas (acceptable, not bugs)

- **Headless vs headed paint timing**: Lighthouse's default headless mode is the same as ours, so this is consistent. If you compare against a manually-driven headed Chrome, expect headed to fire LCP a bit later because of the additional UI compositor work.
- **Single-run vs median**: Lighthouse runs one navigation per audit; OhMyPerf takes the median of N runs (default 3, configurable). The ±10% band accounts for run-to-run variance on the same host.
- **TTFB pre-/post-redirect**: Both tools measure from the first navigation request. Pages that 30x redirect a few hops will show a TTFB that includes the redirect chain.

## How to reproduce locally

```bash
pnpm install
pnpm exec playwright install chromium
pnpm test:parity
```

If you see a fixture fail, run with `--reporter=verbose`:

```bash
pnpm --filter @ohmyperf/tests-parity exec vitest run --reporter=verbose
```

The harness logs each metric pair like `lcp: ours=820.4 lh=798.1 rel=2.8% (tolerance 10%)`.

## What's NOT covered (defer)

- Cross-browser parity (Firefox / WebKit): no driver shipped in v1.
- Mobile emulation parity: v1 runs desktop viewport only; `--mode ci-stable` adds Fast 4G + CPU throttle but no mobile UA.
- Real user RUM-vs-lab comparison: see the post-GA roadmap.

If a parity test fails on a PR you didn't expect, first check whether your change touches `cwv-collector.ts`, `cwv-inline-script.ts`, `loading-collector.ts`, `engine.ts`, or the runner Dockerfile's Chromium pin — those are the most common causes.
