# OhMyPerf CI templates

Drop-in CI/CD templates that wrap the `ohmyperf` CLI.

## GitHub Actions

Copy [`github-actions.yml`](./github-actions.yml) to `.github/workflows/ohmyperf.yml`.

Defaults:

- Runs on `pull_request`, `push: main`, and manual `workflow_dispatch`.
- Reads `OHMYPERF_URL` from repository **Variables** (Settings → Secrets and variables → Actions → Variables). Defaults to `http://localhost:3000`.
- 5 runs in `ci-stable` mode (calibrated CPU + Fast 4G network).
- Outputs `report.json`, `report.html`, and `report.md` and uploads them as a workflow artifact.
- On a pull request, posts the Markdown summary as a PR comment.
- If `.ohmyperf-baseline/report.json` is committed, runs `ohmyperf diff` against it. Exit 1 on regression.

### Producing a baseline

To generate `.ohmyperf-baseline/report.json` (commit it to your default branch):

```bash
ohmyperf run "$OHMYPERF_URL" \
  --runs 5 \
  --mode ci-stable \
  --output .ohmyperf-baseline \
  --plugins all
git add .ohmyperf-baseline/report.json
git commit -m "chore: refresh ohmyperf baseline"
```

The diff step uses Mann-Whitney U significance (α=0.05) plus per-metric noise floors documented in `@ohmyperf/core/src/diff.ts`.

### Limitations

- Single-URL only. Multi-URL crawl mode is not yet shipped (see openspec roadmap).
- Scenario user-flows (login → navigate → measure) are not yet supported in v0; the CLI's `run` subcommand measures a single navigation. Track in the OpenSpec backlog.
