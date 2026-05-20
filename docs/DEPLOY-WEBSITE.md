# Deploying apps/website to Cloudflare Pages

The website is a Next.js static export (`apps/website/out/`). Deploy is automated via `.github/workflows/deploy-website.yml`.

## First-time setup (anh, once)

1. **Create Cloudflare Pages project** (one-time, takes 30 seconds):
   - Go to https://dash.cloudflare.com/?to=/:account/pages
   - Click **Create** → **Pages** → **Connect to Git** → select `hoainho/ohmyperf`
   - **Project name**: `ohmyperf`
   - **Production branch**: `main`
   - **Build command**: leave empty (GitHub Actions builds for us)
   - **Build output directory**: `apps/website/out`
   - Click **Save and Deploy** (the first auto-deploy may fail because Cloudflare doesn't know we use pnpm; that's fine, the GitHub Action below takes over)

2. **Get Cloudflare credentials**:
   - **Account ID**: `https://dash.cloudflare.com` → right sidebar → "Account ID" (copy)
   - **API Token**: `https://dash.cloudflare.com/profile/api-tokens` → **Create Token** → use the **Edit Cloudflare Workers** template → restrict to `ohmyperf` account → copy

3. **Add GitHub secrets**:
   - `https://github.com/hoainho/ohmyperf/settings/secrets/actions` → New repository secret
   - `CLOUDFLARE_ACCOUNT_ID` = (the account ID from step 2)
   - `CLOUDFLARE_API_TOKEN` = (the API token from step 2)

## Triggering a deploy

After first-time setup, any of these trigger a deploy:

- **Push to `main`** that touches `apps/website/`, `packages/viewer/`, `packages/design-tokens/`, or `pnpm-lock.yaml` → auto-deploys to production.
- **Manual**: `gh workflow run deploy-website.yml` (deploys current `main` to production).
- **Preview branch**: `gh workflow run deploy-website.yml --field branch=feature/foo` (deploys to a preview URL like `feature-foo.ohmyperf.pages.dev`).

## DNS

By default, Cloudflare gives `https://ohmyperf.pages.dev`. If anh wants a custom domain (`https://ohmyperf.dev`):

1. Cloudflare Pages → `ohmyperf` project → **Custom domains** → **Set up a custom domain** → enter `ohmyperf.dev`
2. Follow the DNS instructions (Cloudflare auto-configures if DNS is already on Cloudflare).

## Troubleshooting

- **Build fails on Cloudflare side** but works in GitHub Action: that's expected — we use the GitHub Action as the build authority, Cloudflare just hosts the output. The "auto build" in the Pages dashboard can be disabled (Cloudflare Pages → Settings → Builds & deployments → Disable automatic deployments).
- **`pnpm install --frozen-lockfile` fails**: the lockfile is out of date. Run `pnpm install` locally and commit `pnpm-lock.yaml`.
