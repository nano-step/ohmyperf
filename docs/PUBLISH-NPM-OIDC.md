# Eliminating NPM_TOKEN via Trusted Publishing (OIDC)

The current `NPM_TOKEN` secret model has a recurring failure mode: tokens expire, get rotated with wrong scopes, leak in logs. **npm Trusted Publishing eliminates the secret entirely** by trusting GitHub's OIDC identity provider to vouch for the workflow.

After this one-time setup, every future v0.X.Y release flows through OIDC. No more E401, no more E404-from-wrong-scope, no more "anh has to rotate the token."

## What's already wired (no anh action needed)

These were shipped this session — already on `origin/main`:

- `.github/workflows/publish-stable.yml` declares `permissions: id-token: write` and uses `actions/setup-node@v4` with `node-version: "24"` (Node 24 bundles npm 11.12.1, well above the 11.5.1 minimum for trusted publishing — see `https://github.com/npm/cli/issues/8525`).
- `.github/workflows/publish-beta.yml` has symmetric OIDC readiness (same Node 24 + `id-token: write` + preflight). So if anh ever wants to migrate beta releases to OIDC too, the workflow side is already ready — only the per-package npm UI config differs.
- npm CLI auto-detects the OIDC environment and tries OIDC before falling back to `NODE_AUTH_TOKEN`. So the current token-based flow continues to work; OIDC simply takes precedence when configured per-package on npmjs.com.

> **Note on beta vs stable**: npm allows only ONE trusted publisher per package. If anh adds `publish-stable.yml` as the trusted publisher, beta releases via `publish-beta.yml` will fall back to `NPM_TOKEN`. The pragmatic recommendation is: **OIDC for stable releases, token path for beta channel** (betas are short-lived and lower-risk). The workflow infrastructure supports either choice with no further changes.

## What anh needs to do (one-time, ~10 minutes total)

For **each `@ohmyperf/*` package** (17 packages as of v0.2.0):

1. Sign in at https://www.npmjs.com/login as `nhonh`.
2. Go to the package page, e.g. `https://www.npmjs.com/package/@ohmyperf/cli`.
3. Click **Settings** → **Publishing access**.
4. Under **Trusted publishers**, click **Add trusted publisher**.
5. Choose **GitHub Actions**.
6. Fill the form exactly:
   - **Organization or user**: `hoainho`
   - **Repository**: `ohmyperf`
   - **Workflow filename**: `publish-stable.yml`  ← exact filename, no path, must include `.yml`
   - **Environment name**: (leave blank — workflow doesn't use environments)
7. Click **Add publisher**.

Repeat for each of these 17 packages:

```
@ohmyperf/cli
@ohmyperf/core
@ohmyperf/design-tokens
@ohmyperf/driver-playwright
@ohmyperf/eslint-plugin         ← new this session
@ohmyperf/fixers                ← new this session
@ohmyperf/mcp-server
@ohmyperf/plugins-builtin
@ohmyperf/reporter-csv
@ohmyperf/reporter-deck
@ohmyperf/reporter-html
@ohmyperf/reporter-json
@ohmyperf/reporter-junit
@ohmyperf/reporter-markdown
@ohmyperf/share-client
@ohmyperf/trace-utils
@ohmyperf/viewer
```

> Note: For the two new packages (`@ohmyperf/eslint-plugin`, `@ohmyperf/fixers`), trusted publishing only works **after the first publish** — npm has no "pending publisher" feature. The current `NPM_TOKEN` (with Read+Write) must successfully publish v0.2.0 first. After that, anh can switch all 17 packages to trusted publishers, and the NPM_TOKEN secret becomes unnecessary for future releases.

## Verifying it works

After configuring trusted publishers + cutting a new release:

```bash
gh workflow run publish-stable.yml --field bump=patch -R hoainho/ohmyperf
gh run watch -R hoainho/ohmyperf
```

In the workflow log, look for:

```
npm notice Publishing to https://registry.npmjs.org/ with OIDC authentication
npm notice 📦  @ohmyperf/cli@X.Y.Z
```

The `with OIDC authentication` line confirms OIDC took over (vs. `with tag latest and public access` which is the token-based path).

## Why this is worth doing

- **Eliminates a recurring failure class.** Token expiry / wrong-scope / leaked-in-logs are all gone.
- **Auto-provenance.** OIDC publishes include cryptographic provenance attestations linking the package to the exact GitHub commit + workflow run that produced it. Visible at `https://www.npmjs.com/package/@ohmyperf/cli` under "Provenance".
- **Short-lived credentials.** Each publish uses a one-shot token valid for ~15 minutes. No long-lived secret to compromise.
- **Industry standard.** Same model PyPI, RubyGems, and GitHub-themselves use. Aligns ohmyperf with supply-chain security best practices.

## Cleanup after OIDC is live (optional)

Once trusted publishing is confirmed working, anh can:

1. Remove the `NPM_TOKEN` secret from `https://github.com/hoainho/ohmyperf/settings/secrets/actions`.
2. Remove the `Preflight — verify NPM_TOKEN authenticates against registry` step from `publish-stable.yml` (since there's nothing to preflight).

The workflow's `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` env var becomes empty/undefined, which npm CLI handles gracefully (it just uses OIDC).

## References

- npm Trusted Publishing docs: https://docs.npmjs.com/trusted-publishers/
- npm CLI OIDC PR: https://github.com/npm/cli/pull/8336
- The E404-on-PUT debugging trap (multiple causes): https://github.com/npm/cli/issues/8525
