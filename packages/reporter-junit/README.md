# `@ohmyperf/reporter-junit`

JUnit XML reporter for ohmyperf. One `<testcase>` per budget threshold.

- Emits a `report.junit.xml` with one `<testcase>` per `BudgetEvaluation` entry — perfect for Jenkins, GitLab CI Test Reports, CircleCI, Buildkite.
- Failed thresholds surface as native test failures in CI test runners.
- Use via `ohmyperf run --format=junit` then publish as a JUnit artifact in your CI.

Part of the [ohmyperf](https://github.com/hoainho/ohmyperf) monorepo. Most users install the [`@ohmyperf/cli`](https://www.npmjs.com/package/@ohmyperf/cli) or [`@ohmyperf/mcp-server`](https://www.npmjs.com/package/@ohmyperf/mcp-server) binary rather than this package directly.

## Install

```bash
npm install @ohmyperf/reporter-junit
```

Requires Node ≥ 22.

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
