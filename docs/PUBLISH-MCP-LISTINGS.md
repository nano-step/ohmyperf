# Publishing @ohmyperf/mcp-server to MCP registries

After v0.2.0 ships to npm, list the MCP server on these registries to maximize discovery:

## smithery.ai (priority — has 10k+ daily MCP users)

The repo root already has `smithery.yaml` configured for stdio runtime invoking `npx -y @ohmyperf/mcp-server@latest`.

**Submission steps** (anh, once):

1. Sign in at https://smithery.ai with anh's GitHub account (`hoainho`).
2. Go to https://smithery.ai/new
3. Choose **"Add from GitHub"** → select `hoainho/ohmyperf`.
4. Smithery auto-detects the `smithery.yaml` and scans the published `@ohmyperf/mcp-server` package for tool metadata.
5. Fill the listing form:
   - **Title**: `OhMyPerf`
   - **Description**: `Measure real Core Web Vitals (LCP/INP/CLS/FCP/TTFB/TBT) from inside AI agents. 14 tools including measure, propose_patch, verify_fix.`
   - **Tags**: `performance`, `web-performance`, `core-web-vitals`, `playwright`, `lighthouse-alternative`
   - **Category**: Performance / Developer Tools
6. Submit. Approval usually takes a few hours.

After approval, the listing URL is `https://smithery.ai/server/@ohmyperf/mcp-server`.

## glama.ai (secondary — MCP directory)

Glama auto-indexes public MCP servers from GitHub. Submission is one-form:

1. Go to https://glama.ai/mcp/servers
2. Click **"Submit Server"**
3. Paste the GitHub URL: `https://github.com/hoainho/ohmyperf`
4. Server type: **stdio**
5. Install command: `npx -y @ohmyperf/mcp-server`
6. Tools/capability description: same as smithery (copy/paste).

After approval, the listing URL is `https://glama.ai/mcp/servers/ohmyperf`.

## (Optional) modelcontextprotocol.io official directory

The official MCP spec maintains a community list at https://github.com/modelcontextprotocol/servers. To add ohmyperf:

1. Fork `modelcontextprotocol/servers`.
2. Edit `README.md` under the **Community Servers** section.
3. Add a row:
   ```markdown
   | [OhMyPerf](https://github.com/hoainho/ohmyperf) | Real Core Web Vitals measurement (LCP/INP/CLS) with statistical rigor (Mann-Whitney U), OOPIF-aware, agent fix loop via propose_patch + verify_fix. |
   ```
4. Open a PR to upstream. Approval is community-moderated.

## After listing

- Add badges to root README.md:
  ```markdown
  [![smithery](https://smithery.ai/badge/@ohmyperf/mcp-server)](https://smithery.ai/server/@ohmyperf/mcp-server)
  [![glama](https://glama.ai/mcp/servers/ohmyperf/badge)](https://glama.ai/mcp/servers/ohmyperf)
  ```
- Tweet/post: "ohmyperf now in smithery + glama — install via `npx -y @ohmyperf/mcp-server` or one-click from the registries."
