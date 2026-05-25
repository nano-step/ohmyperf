# Diagnosing the NHO_NPM_TOKEN failure (v0.2.0 publish blocker)

## Symptom

`pnpm publish -r --access public --no-git-checks` in `.github/workflows/publish-stable.yml` fails with:

```
npm error code E404
npm error 404 Not Found - PUT https://registry.npmjs.org/@ohmyperf%2fdesign-tokens - Not found
npm error 404  '@ohmyperf/design-tokens@0.1.1' is not in this registry.
```

## The misleading part

`E404` on a `PUT` looks like "package doesn't exist" but **npm registry returns 404 for `PUT` requests when the token authenticates but lacks write permission on the scope**. This is a deliberate npm design to avoid leaking package existence to unauthorized tokens.

## Verified evidence trail

| Run | Type | Error | What it tells us |
|---|---|---|---|
| `26136471633` | whoami debug | `E401` | The previous token (before rotation) was outright invalid. |
| `26136317983` onwards | publish-stable | `E404` on PUT | The current token (rotated some time between 01:51 and 01:54 on 2026-05-20) **does authenticate** with the registry — otherwise it would also return E401 — but **cannot write to the `@ohmyperf` scope**. |

The NHO_NPM_TOKEN secret was last updated at 2026-05-19T15:22:09Z, confirmed via:

```bash
gh secret list -R hoainho/ohmyperf
# NHO_NPM_TOKEN	2026-05-19T15:22:09Z
```

## What anh needs to do

The current token has **Read-only** access on `@ohmyperf`. Generate a new token with **Read+Write**:

1. Go to https://www.npmjs.com/settings/nhonh/tokens
2. Click **Generate New Token** → **Granular Access Token**
3. **Name**: `ohmyperf-publish-v0.2.0`
4. **Expiration**: 1 year (max allowed)
5. **Permissions** → **Packages and scopes**:
   - **Permissions**: `Read and write` (**critical** — the current token is `Read-only`)
   - **Select packages and scopes**: choose the `@ohmyperf` organization
6. Copy the new token (shown once).
7. Replace the GitHub secret:
   ```bash
   gh secret set NHO_NPM_TOKEN -R hoainho/ohmyperf --body 'npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
   ```
   Or via the GitHub UI: `https://github.com/hoainho/ohmyperf/settings/secrets/actions` → `NHO_NPM_TOKEN` → **Update secret**.

## Trigger the publish

```bash
gh workflow run publish-stable.yml --field bump=minor -R hoainho/ohmyperf
```

This bumps the workspace from `0.1.0` → `0.2.0` and publishes 15 `@ohmyperf/*` packages + the 2 new packages added this session (`@ohmyperf/eslint-plugin`, `@ohmyperf/fixers` — total 17 publishable packages).

## Verification

After the workflow succeeds:

```bash
npm view @ohmyperf/cli version           # expect 0.2.0
npm view @ohmyperf/eslint-plugin version # expect 0.2.0 (first publish — new package this session)
npm view @ohmyperf/fixers version        # expect 0.2.0 (first publish — new package this session)
npx -y @ohmyperf/cli@0.2.0 doctor        # expect OK
```

## Why I (the agent) cannot do this

Generating a npm token requires logging in as `nhonh` on npmjs.com with anh's email + password + 2FA. This is the credential boundary an autonomous agent must not cross. The session-distilled atom for this is at `~/.opencode/atoms/2026-05-20-npm-token-refresh-required.md` (if/when the distiller runs).
