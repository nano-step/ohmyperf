# Publishing OhMyPerf to the VSCode Marketplace

The extension lives at `apps/ide-vscode/`. Publish is automated via `.github/workflows/publish-vscode.yml`.

## First-time setup (anh, once)

1. **Create marketplace publisher** (`ohmyperf`, one-time):
   - Sign in at https://marketplace.visualstudio.com/manage with anh's Microsoft account.
   - **New publisher** → ID: `ohmyperf` (must match `publisher` field in `apps/ide-vscode/package.json`).
   - Display name: `OhMyPerf`.

2. **Generate an Azure DevOps Personal Access Token**:
   - Go to https://dev.azure.com/<your-org>/_usersSettings/tokens
   - **+ New Token** → Name: `vsce-publish-ohmyperf`, Organization: **All accessible organizations** (required for marketplace).
   - **Scopes** → **Custom defined** → expand **Marketplace** → check **Manage**.
   - Expiration: 1 year (Microsoft maximum).
   - Copy the token (shown only once).

3. **Add the GitHub secret**:
   - `https://github.com/hoainho/ohmyperf/settings/secrets/actions` → **New repository secret**
   - `VSCE_PAT` = (the token from step 2)

## Triggering a publish

After first-time setup:

- **Dry run** (build .vsix without publishing): `gh workflow run publish-vscode.yml --field dryRun=true`. The .vsix is uploaded as an artifact for 30 days; anh can download to install locally via `code --install-extension ohmyperf-vscode.vsix` for testing.
- **Real publish**: `gh workflow run publish-vscode.yml`.

## Local testing

```bash
pnpm --filter ohmyperf-vscode build
pnpm --filter ohmyperf-vscode exec vsce package --no-dependencies --out ohmyperf-vscode.vsix
code --install-extension apps/ide-vscode/ohmyperf-vscode.vsix
```

## Version bumping

The extension's `version` field is NOT auto-bumped by `publish-stable.yml` (which skips packages with `"private": true`). Bump manually before publishing:

```bash
# Match the workspace version (e.g. after v0.2.0 lands on npm)
node -e 'const p = require("./apps/ide-vscode/package.json"); p.version = "0.2.0"; require("fs").writeFileSync("./apps/ide-vscode/package.json", JSON.stringify(p, null, 2) + "\n");'
git -c user.email=nhoxtvt@gmail.com -c user.name='Hoài Nhớ' add apps/ide-vscode/package.json
git -c user.email=nhoxtvt@gmail.com -c user.name='Hoài Nhớ' commit -m "chore(ide-vscode): bump version to 0.2.0 for marketplace publish"
```

Then run `gh workflow run publish-vscode.yml`.

## Required metadata (already in `apps/ide-vscode/package.json`)

- `publisher`: `ohmyperf` (matches marketplace publisher ID)
- `engines.vscode`: `^1.85.0` (min supported VSCode)
- `categories`: `["Testing", "Other"]`
- `keywords`: web-performance, core-web-vitals, lcp, inp, cls, etc.
- `repository.url`, `bugs.url`, `homepage`: all point at `hoainho/ohmyperf`
- `license`: Apache-2.0

## Optional polish (later)

- **Icon**: 128×128 PNG at `apps/ide-vscode/icon.png` + `"icon": "icon.png"` in package.json.
- **README.md**: shows on the marketplace listing page. Already exists at `apps/ide-vscode/README.md`.
- **CHANGELOG.md**: shows on the listing under "Changelog" tab. Use repo root CHANGELOG.md content for now.
