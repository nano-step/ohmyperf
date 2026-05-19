# `@ohmyperf/reporter-markdown`

Markdown reporter for ohmyperf. ~2 KB PR-comment-friendly summary.

- Emits Markdown with the CWV verdict table (good / needs-improvement / poor), audit list, calibration metadata, and run statistics.
- Designed for GitHub Actions PR comments + Slack snippets. Renders cleanly on GitHub, GitLab, and Bitbucket.
- Use via `ohmyperf run --format=markdown` or wire into GitHub Actions to post on every PR.

Part of the [ohmyperf](https://github.com/hoainho/ohmyperf) monorepo. Most users install the [`@ohmyperf/cli`](https://www.npmjs.com/package/@ohmyperf/cli) or [`@ohmyperf/mcp-server`](https://www.npmjs.com/package/@ohmyperf/mcp-server) binary rather than this package directly.

## Install

```bash
npm install @ohmyperf/reporter-markdown
```

Requires Node ≥ 22.

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
