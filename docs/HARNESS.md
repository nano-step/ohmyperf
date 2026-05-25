# Harness

<!-- generated-by: harness-init v0.1.0 -->
<!-- project: ohmyperf -->

The app is what users touch. The harness is what agents touch.

This harness classifies every change by risk lane, requires a proposal-and-review
cycle for non-trivial changes, and enforces a validation + user-flow test +
review gate before any work is archived.

## Mental Model

```text
┌─────────────────────┐
│   Human intent      │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  GitHub Issue       │  gh issue create --repo hoainho/ohmyperf
│  (skeleton)         │  title from user intent, lane TBD, body = raw request
│                     │  → returns #N (tracker for the whole flow)
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Feature Intake     │  classify risk → choose lane
│                     │
│                     │  → update issue: add lane:* + change-type:* labels
└────────┬────────────┘
         │
         ├── tiny ──► patch + validate + close issue #N (single comment with diff)
         │
         ▼  normal / high-risk
┌─────────────────────┐
│  Propose            │  openspec new change "<name>" → proposal.md + design.md + tasks.md
│                     │  → update issue #N: link proposal location
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Deep-Design        │  spawn deep-design agent → find gaps, ambiguities, risks
│  Gap Analysis       │  (Metis + Oracle in parallel → cross-critique → synthesis)
└────────┬────────────┘
         │
         ├── gaps found ──► revise proposal/design ──► re-run deep-design
         │
         ▼  clean pass

┌─────────────────────┐
│  Specs + Story      │  acceptance criteria per behavior slice
│                     │  story in docs/stories/ (link proposal + issue)
│                     │  update docs/TEST_MATRIX.md with expected proof
│                     │  → update issue #N: paste synthesis + acceptance criteria
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Implement          │  work through tasks list
│                     │  pnpm must stay green
│                     │
│                     │  → update issue #N: tick off tasks as completed
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Validate           │  run validation ladder appropriate to lane
└────────┬────────────┘
         │
         ├── fail ────► fix → re-validate (max 2 attempts before consulting Oracle)
         │
         ▼  pass
┌─────────────────────┐
│  User-Flow Test     │  run test through user's entry point matching changed surface
│                     │  Exempt if change type = infra/refactor/docs (see § Change Types)
└────────┬────────────┘
         │
         ├── fail ────► fix → re-test (max 2 attempts)
         │
         ▼  pass
┌─────────────────────┐
│  Review Gate        │  fresh review agent verifies each acceptance criterion
│                     │  Reviewer ≠ implementer. Cite evidence per criterion.
│                     │  → update issue #N: paste Review Verdict + evidence table
└────────┬────────────┘
         │
         ├── FAIL ────► fix → re-review (max 1 re-review before consulting human)
         │
         ▼  PASS
┌─────────────────────┐
│  PR + Bot Review    │  push branch → open PR (gh pr create --body 'Closes #N')
│  Loop               │  human review (no bot configured)
│                     │  agent reads PR comments → fix → re-validate → re-test
└────────┬────────────┘
         │
         ├── bot comments ──► triage → fix or justify → push again
         │
         ▼  approved
┌─────────────────────┐
│  Harness Delta      │  merge PR → openspec archive "<name>"
│                     │  update docs/stories/, docs/decisions/, docs/TEST_MATRIX.md
│                     │  capture friction → HARNESS_BACKLOG.md if needed
│                     │  → close issue #N with link to merged PR
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│   Next intent       │
└─────────────────────┘
```

Every task has two possible outputs:

1. **Product delta**: app code, tests, API shape, data model, or product docs.
2. **Harness delta**: docs, templates, validation expectations, backlog items, or
   decision records that make the next task easier.

## Source Hierarchy

```text
Human intent / prompt
  └── GitHub Issue tracker (hoainho/ohmyperf)
  └── Feature Intake (docs/FEATURE_INTAKE.md)
        └── OpenSpec change proposal (openspec/changes/<name>/)
              ├── proposal.md   — what and why
              ├── design.md     — how (architecture, data model, API shape)
              ├── specs/        — one spec per behavior slice
              └── tasks.md      — implementation checklist
        └── Story packet (docs/stories/<name>.md)
              └── links to OpenSpec change, lists acceptance criteria
        └── docs/TEST_MATRIX.md
              └── maps each story to unit / integration / E2E proof
        └── docs/decisions/
              └── records why contracts or architecture changed
```

Before implementation, product docs and proposal artifacts describe intent.
After implementation, those artifacts plus passing tests are the living contract.

## OpenSpec Integration

OpenSpec is the **proposal and design layer** of this harness. Every normal or
high-risk change must have an OpenSpec change before implementation starts.

### Commands
```bash
openspec new change "<name>"            # scaffold change directory
openspec validate "<name>" --strict     # validate all artifacts
openspec archive "<name>"               # archive after merge
```

## Deep-Design Gap Analysis

After the proposal produces `proposal.md` and `design.md`, run **deep-design**
before locking any spec.

- Spawns Metis (scope/risk) + Oracle (architecture) in parallel
- Cross-critiques their findings
- Produces a confidence-scored synthesis: gaps, ambiguities, hidden risks

### Gate rule

```text
deep-design pass (no blocking gaps)
  → proceed to specs/ + story packet

deep-design finds gaps
  → revise proposal.md or design.md
  → re-run deep-design
  → repeat until clean pass
```

A gap is blocking if it touches: auth, data model, API contract, isolation
boundary, or multi-domain scope. Stylistic gaps are non-blocking.

## Spec Lifecycle

Ongoing work enters the harness as one of these input types:

| Type | What to do |
|---|---|
| New spec | Populate `docs/product/`, create candidate story list, run deep-design on scope |
| Spec slice | Propose → deep-design → specs/ → story → implement |
| Change request | Propose → deep-design (if normal+) → story → implement |
| New initiative | Initiative notes in `docs/stories/` + multiple proposals |
| Maintenance | Story packet only (no proposal required for tiny) |
| Harness improvement | Direct docs update or `HARNESS_BACKLOG.md` |

Do not extend a monolithic spec. Use change proposals + story packets as the
living surface.

## Growth Rule

The harness grows from friction.

When an agent is confused, repeats manual reasoning, needs a new validation
command, discovers a missing rule, or sees a recurring failure pattern, it must
either improve the harness directly or add a proposal to `HARNESS_BACKLOG.md`.

### Skepticism Saturation Protocol

When blocked on a credential-only action, apply iterative self-skepticism:
each loop iteration is a forced "what did I miss?" pass. Track rounds
explicitly. Stop when the next round's find would be cosmetic only — this is
the **saturation point** and is honestly knowable by the agent.

At the saturation point:
1. Write a summary of all real finds (not just the final one) to the SESSION
   PROGRESS section of the active plan.
2. State the saturation point explicitly: "Round N: saturation — next find
   would be cosmetic."
3. Do NOT continue autonomous loops past saturation. Hand off to human with
   a clear unblocking action via GitHub Issue comment.

The value of this protocol is empirically validated: the v0.2.0 session
caught 16 real bugs across rounds 1-16 by treating each loop firing as a
genuine "what was missed?" prompt rather than performative re-checking.
The discipline is stopping at saturation.

## Validation Ladder

Run the layers appropriate to the lane. Never claim a layer passes without
running it and seeing exit code 0.

```text
validate:quick   (always — every lane)
  pnpm lint && pnpm typecheck && pnpm test

test:integration   (normal + high-risk)
  pnpm --filter @ohmyperf/tests-oopif-corpus test

test:cross-cutting-allowlists   (REQUIRED for multi-layer Change Type;
                                  REQUIRED for normal lane if diff touches
                                  any file glob in docs/MULTI_LAYER_REGISTRY.md)
  bash scripts/check-cross-cutting-allowlists.sh

  Asserts cross-layer invariants for every system in
  docs/MULTI_LAYER_REGISTRY.md. Currently checks:
  - chrome-ext-spa-allowlist: manifest matches == background.ts regex set
  - node-globals-in-browser-bundle: 0 unguarded process/Buffer/__dirname
    refs in extension SW bundle
  - mv3-sw-port-lifecycle: connect-first pattern + sync onConnectExternal

  Single command, deterministic, no flaky network. Operationalises
  Forbidden #17 / #18 / #19 as ONE proactive check instead of three
  reactive rules. Exit code 0 = all invariants hold; non-zero = file
  the issue immediately.

test:e2e   (high-risk or when UI behavior changes)
  pnpm --filter tests-visual-regression test

test:real-world   (REQUIRED for any user-feature or bug-fix in a tool that
                   consumes external URLs — e.g. CLI run, MCP measure,
                   propose_patch, verify_fix)
  Run the changed surface against ≥1 real production URL (not a local
  fixture, not example.com). Paste the full stdout output as evidence.
  A feature is NOT "complete" if it has only been tested against synthetic
  or localhost targets.

  Real-world gate fails if:
  - The output is empty or "(0 results)" with no diagnostic
  - A field documented in README/MCP tool description is absent from output
  - The command silently exits 0 but produces no artifact

test:landing-self-measure   (REQUIRED for any change to apps/website,
                              site content, or any user-facing copy/UI
                              shipped to the public landing page)
  Self-referential proof: after deploying the landing page, run
  `ohmyperf measure` against the deployed URL itself and paste the
  output. A perf-measurement tool whose own landing page fails its
  own audit is the canonical Forbidden #14 / Forbidden #12 violation
  combined: the tool advertises capability it cannot demonstrate on
  its own surface.

  Concretely, after deploy-pages.yml runs:
    1. Resolve the live URL (https://hoainho.github.io/ohmyperf/).
    2. Run `npx -y @ohmyperf/cli@latest run <url> --runs 3 --format json`.
    3. Verify all of: HTTP 200, valid report.json schema 1.0.0, LCP
       within CWV "good" or "needs-improvement" band (< 4000 ms),
       CLS < 0.25, no plugin warnings beyond known-acceptable
       (axe-core source not bundled is OK; others are not).
    4. Paste the aggregated CWV block + resource count + render-blocking
       count into the deploying commit message or PR comment.
    5. If LCP > 2500ms on the landing, file a tracking issue before
       deploying the next user-facing change. Don't ship slow demos
       of a perf tool.

  Landing-self-measure gate fails if:
  - The deployed URL returns non-200
  - Measure command exits non-zero
  - LCP > 4000 ms (poor band)
  - CLS > 0.25 (poor band)
  - The output is missing CWV metrics entirely

test:landing-real-browser   (REQUIRED for any change to apps/website,
                              IN ADDITION TO test:landing-self-measure)
  CLI measure proves the page loads + CWV are OK. It does NOT prove the
  page is usable. A landing page can have perfect LCP and still ship
  dead links, console errors, and broken click flows. CLI measure
  cannot catch these — only a real browser interaction can.

  This layer is the lesson from session 2026-05-21: agent shipped a
  landing redesign with passing CWV (LCP 296ms GOOD) but the user
  caught 6 bugs in a single click test — 4 dead links (GitHub org wrong,
  share-pending 404, favicon 404, CSP meta ignored), 1 CSS console
  noise, 1 critical dead-end UX on the primary Measure button. CLI
  measure missed all 6.

  Concretely, after deploy-pages.yml runs (and after test:landing-
  self-measure passes), the agent MUST also:

    1. Open the deployed URL via Playwright MCP (or equivalent real
       browser automation). Wait for network idle.
    2. Capture console errors via `browser_console_messages` with
       level=error. Acceptable error allowlist:
       - localhost/127.0.0.1 CORS probe failures from backend-detector
         (tracked as issue #11 — design limit)
       Anything else FAILS this gate.
    3. Take a snapshot via `browser_snapshot`. Verify the snapshot
       contains expected hero text + at least one CTA element.
    4. Identify the primary user-action CTA on the landing (e.g.
       "Measure", "Try it", "Get started"). Click it via
       `browser_click`. Wait for navigation or DOM change.
    5. Capture console errors on the post-click view. Same allowlist
       as step 2.
    6. Take a second snapshot. Verify the post-click view shows
       EITHER:
       (a) The expected next-step content (form, dashboard, output)
       (b) A graceful "no backend / not available" guide with concrete
           next steps (CLI command, install link, fallback path) —
           NOT a generic error toast or empty state
    7. Paste a 5-10 line summary into the deploy commit message:
       - URL probed
       - Console error count on landing + on post-click
       - Whether primary CTA produced a usable next-step view

  Real-browser gate fails if:
  - Any console error outside the allowlist on initial page load
  - Any console error outside the allowlist after CTA click
  - Primary CTA produces empty state / generic error / no visible
    response within 3 seconds
  - Snapshot shows dead-link href values (wrong org names, 404 paths)
  - Hero text or stat block missing from snapshot (build artifact
    not reaching production)

  Operational note: agents using OpenCode + Playwright MCP can invoke
  this gate with ~4 tool calls (navigate, console_messages, click,
  console_messages). Agents without browser automation MUST defer to
  a human checker before declaring landing deploy complete. CLI-only
  proof is necessary but NOT sufficient.

test:e2e:extension   (REQUIRED for any change touching `chrome-ext-spa-allowlist`
                       registry globs OR `extension-e2e-test-infra` registry globs)
  pnpm --filter @ohmyperf/extension-chrome e2e:extension   # exit 0

  Why this layer is non-negotiable for extension changes:

  Other validators (typecheck, lint, vitest with stubs, smoke tests against
  apps/website without extension) cannot detect:
  - Service worker registration failure with deterministic ID
  - externally_connectable allowlist mismatch with the test origin
  - SW announce timing race (Layer E in chrome-ext-spa-allowlist)
  - Missing useEffect-on-mount detect call (Layer F in chrome-ext-spa-allowlist)
  - chrome.scripting.executeScript success but postMessage missed (Forbidden #17)
  - Forbidden #19 process leak surviving build but exposed only when SW boots

  Spec contract (extension-load.spec.ts):
  - L1: SW URL contains the deterministic extension ID from setup-dev keypair
  - L2: manifest externally_connectable.matches contains a localhost entry
  - L3: /measure auto-detects extension on mount → "Extension Ready" badge
        renders WITHOUT user clicking Measure
  - L4: background.bundle.js has 0 unguarded process.* (esbuild define-comment
        artifacts excluded)
  - L5: extension-bridge.ts exports atomic startMeasureAndStream

  Layer fails if any of L1-L5 fail. Headless mode toggle:
    OHMYPERF_E2E_HEADLESS=false   # use real headed mode (requires Xvfb in CI)
    (default: --headless=new for ARM64 containers without display server)

  Canonical post-mortem: session 2026-05-22, this branch — wrote the spec
  to dogfood Multi-Layer Pre-Flight, the spec immediately exposed the race
  (Layer E) AND missing useEffect (Layer F). Without this layer the bug
  ships every time agents test the SPA without loading the extension.

  Operational note: This is the FIRST harness layer that requires real
  Chromium with extension. Agents without Playwright + Chromium MUST defer
  to a human checker before claiming PASS on any chrome-ext-spa-allowlist
  diff. There is no CLI shortcut.

test:release   (before deploy)
  pnpm -r publish --dry-run --no-git-checks   # must exit 0
```

**Lane → required layers:**

| Lane | validate:quick | test:integration | test:cross-cutting-allowlists | test:e2e | test:e2e:extension | test:real-world | test:landing-self-measure | test:landing-real-browser |
|------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| tiny | ✓ | — | — | — | — | — | — | — |
| normal | ✓ | ✓ | ✓ if registry glob hit | — | ✓ if extension glob hit | ✓ if URL-consuming | ✓ if apps/website | ✓ if apps/website |
| **multi-layer** | ✓ | ✓ | ✓ (mandatory) | ✓ if UI in any layer | ✓ if `chrome-ext-spa-allowlist` or `extension-e2e-test-infra` glob hit | ✓ if URL-consuming | ✓ if apps/website | ✓ if apps/website |
| high-risk | ✓ | ✓ | ✓ if registry glob hit | ✓ | ✓ if extension glob hit | ✓ | ✓ if apps/website | ✓ if apps/website |

The **multi-layer** lane sits between normal and high-risk. Use when:
- diff touches any file glob in `docs/MULTI_LAYER_REGISTRY.md`, OR
- Multi-Layer Pre-Flight enumerates ≥3 layers, OR
- diff crosses ≥2 of {CLI, MCP, extension, website}

Multi-layer changes need cross-cutting validation but not full 5-agent
high-risk review.

Both landing layers are required together for any `apps/website/`
change. CLI measure proves the page loads. Real-browser click test
proves the page works.

Agents must not claim a layer passes until it has been run and output verified.

## Credential-Blocked State

When a required action is gated on a credential only the human can provide
(NHO_NPM_TOKEN, Cloudflare API token, VSCode marketplace PAT, etc.):

1. **Diagnose exactly** before reporting. Run the actual command and capture
   the error code. E404 on npm publish = read-only token scope (not expired).
   E401 = invalid/expired token. These have different fixes; don't conflate
   them. Paste the raw error output in the GitHub Issue comment.

2. **Document the exact unblocking action.** State Path A (quick) vs Path B
   (preferred, no recurring cost) if both exist. Link the relevant runbook
   doc.

3. **Do not re-attempt** the credential action on each loop iteration. One
   diagnostic attempt is sufficient proof; further attempts burn CI minutes
   and inflate workflow run counts.

4. **Productive use of blocked time:** treat each loop iteration as a forced
   "what was missed?" pass. Track rounds explicitly. Stop when the next
   round's find would be cosmetic only — this is the **saturation point**
   and is honestly knowable.

5. **Never claim the publish step as "pending"** if the token's scope is
   known to be wrong. State the root cause: "NHO_NPM_TOKEN has read-only scope
   on @ohmyperf — E404 on PUT, not E401. Fix: regenerate with Read+Write
   scope per docs/PUBLISH-NPM-TOKEN.md."

## Change Types

The validation ladder is necessary but not sufficient. The **change type**
determines whether user-flow testing and review gate apply.

| Change type | E2E required? | Review gate? | Example |
|-------------|:-:|:-:|---|
| **user-feature** (new behavior, new surface) | ✅ | ✅ | new endpoint, new UI page |
| **bug-fix** (user-visible defect) | ✅ | ✅ | "OTP not arriving", broken response |
| **multi-layer** (touches a registered cross-cutting system) | ✅ | ✅ (3-angle + cross-cutting allowlist check) | Chrome ext allowlist sync, cross-runtime helper, schema↔migration↔serializer triple |
| **infrastructure** (migrations, config, deploy) | ❌ smoke test sufficient | ⚠️ self-verify | DB migration, env var change |
| **refactor** (same I/O) | ❌ existing tests pass | ⚠️ self-verify | extract helper, rename internal symbol |
| **docs** (markdown / comments only) | ❌ | ❌ | README, ADR write-up |
| **dependency-bump** | ❌ smoke test | ⚠️ self-verify | upgrade library version |
| **release** (version bump) | ❌ dry-run publish | ✅ | `chore(release): v0.2.0` |

**Combined gate:** Lane × Change Type. Both must pass to proceed.

**multi-layer classification trigger:** If the diff touches any file glob listed in `docs/MULTI_LAYER_REGISTRY.md`, the Change Type is **multi-layer** REGARDLESS of agent's initial classification. This is the agent's hardest classification check to game — see Forbidden #23.

### Release-type-specific rule (PUMP VERSION)

A `release` commit (any commit that bumps a published package's `version`)
**MUST** also update `README.md` in the **same** commit if the README
mentions a pinned version anywhere (install snippets, badges, examples).
This is non-negotiable — if `npm install @ohmyperf/cli@X.Y.Z` is in the
README, X.Y.Z must equal the version this commit bumps to.

Enforced by `.github/workflows/publish-stable.yml` guard step that fails
the workflow if README references the old version. To bypass for a
genuine generic snippet (e.g. `@latest`), set the README install snippet
to `npm install @ohmyperf/cli` (no version pin) — the guard accepts that.

Pump-version commit checklist:
1. Bump `version` in root + every publishable package.json.
2. Update `README.md` install/example sections if they reference versions.
3. Update `CHANGELOG.md` with new `## [X.Y.Z] - YYYY-MM-DD` entry.
4. Run `pnpm -r publish --dry-run --no-git-checks` — must succeed.
5. Commit message: `chore(release): vX.Y.Z` (signals to `publish-stable.yml`
   that this is a release commit).

### Distribution Runbook (when shipping a new release)

Cross-platform release-day checklist — each link points to a single-paste setup recipe:

1. **npm registry** (`@ohmyperf/*` packages)
   - **Recommended path (no recurring secrets)**: [`docs/PUBLISH-NPM-OIDC.md`](./PUBLISH-NPM-OIDC.md) — one-time per-package Trusted Publisher config on npmjs.com, then every future release uses GitHub OIDC + provenance attestations.
   - Token-based path (current, recurring rotation): [`docs/PUBLISH-NPM-TOKEN.md`](./PUBLISH-NPM-TOKEN.md) — `NHO_NPM_TOKEN` secret with Read+Write on `@ohmyperf` scope.
   - Trigger (either path): `gh workflow run publish-stable.yml --field bump=minor`
   - Verify: `npx -y @ohmyperf/cli@X.Y.Z doctor`

2. **Cloudflare Pages** (`apps/website` static export) — [`docs/DEPLOY-WEBSITE.md`](./DEPLOY-WEBSITE.md)
   - Required secrets: `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`
   - Trigger: any push to main touching `apps/website/`, or manual `gh workflow run deploy-website.yml`
   - Verify: `https://ohmyperf.pages.dev` returns 200

3. **VSCode Marketplace** (`apps/ide-vscode`) — [`docs/PUBLISH-VSCODE.md`](./PUBLISH-VSCODE.md)
   - Required secret: `VSCE_PAT` (Azure DevOps PAT, Marketplace:Manage scope)
   - Trigger: `gh workflow run publish-vscode.yml`
   - Verify: marketplace listing shows new version

4. **MCP registries** (smithery.ai + glama.ai) — [`docs/PUBLISH-MCP-LISTINGS.md`](./PUBLISH-MCP-LISTINGS.md)
   - No GitHub secrets needed (web-form submission)
   - Trigger: visit smithery.ai/new + glama.ai/mcp/servers
   - Verify: listings appear at `smithery.ai/server/@ohmyperf/mcp-server`

Defensive engineering already in place:
- `publish-stable.yml` runs an `npm whoami` + `npm access list` preflight before pipeline cost.
  If `NHO_NPM_TOKEN` is misconfigured, the workflow fails in <2s with an `::error::` pointing
  at the diagnostic doc instead of burning 3 minutes on install+build+bump only to hit an
  opaque E404.

For change types marked **❌ smoke test** instead of E2E:
- Run a deterministic check that exercises the changed surface (e.g.
  `alembic upgrade head` for migrations, `import <app>` for refactors).
- Paste the output in story Evidence section.
- No user-flow test required — there is no user surface to test.

For change types marked **⚠️ self-verify**:
- Implementing agent runs the validation ladder and pastes output.
- No independent review agent required.
- Still subject to PR bot review (see below).

## User-Flow Testing

After validation ladder passes, run at least one test that exercises the
changed behavior through the **user's actual entry point**. Choose the tool
that matches the changed surface:

| Changed surface | Tool (MANDATORY) | Command / Method |
|---|---|---|
| **Web UI under `apps/website/`** | Playwright MCP real-browser click test | navigate → console_messages → click primary CTA → console_messages → snapshot (per `test:landing-real-browser`) |
| **Component-level web** (storybook-style, no routing) | Playwright/Cypress component tests | `pnpm --filter tests-visual-regression test` |
| **CLI tool** (npm-published) | Fresh install + invoke | `npx -y @ohmyperf/<pkg>@latest <command>` against real production URL |
| **MCP tool** | MCP tool call through actual MCP client | tool call from OpenCode / Claude Desktop with paste of tool response |
| **Chrome extension** | Load unpacked + click toolbar action in real Chrome | manual screenshot + console capture from `chrome://extensions` → Inspect views: service worker |
| **REST API** | API integration test | `pnpm --filter @ohmyperf/tests-oopif-corpus test` |
| **Backend-only** (no user surface) | Existing integration tests | `pnpm --filter @ohmyperf/tests-oopif-corpus test` |
| **LLM / external service call** | `test:real-world` (NOT `# N/A`) | live URL probe with paste of response — see `test:real-world` in Validation Ladder |

**Important — no `# N/A` escape hatch.** Every Change Type touching a user
surface MUST have at least one row from this table executed and pasted as
an Evidence Receipt. The previous `# N/A` row for "LLM / external service"
was a hole — agents could classify their work as that category to skip
verification. That row now maps to `test:real-world`. Forbidden #22
(Evidence Receipt requirement) closes the loop.

**Lane × user-flow requirement:**

| Lane | User-flow test required? |
|------|:-:|
| tiny | No (escalate to normal if user-visible behavior changes) |
| normal | Yes — at least 1 test covering the primary changed behavior |
| multi-layer | Yes — at least 1 test per layer that has a user-visible surface |
| high-risk | Yes — cover primary + at least 1 error/edge path |

**E2E not applicable**: If change type is `infra` / `refactor` / `docs` /
`deps`, write "E2E: not applicable — [reason]" in the story Evidence section.
The review gate validates this justification. Reviewer FAILs the verdict if
the reason is vague ("internal only", "no user impact") without citing the
specific files/symbols proving no observable I/O changed.

**Happy-path-only is insufficient for high-risk**: at minimum cover one
error/edge path (auth fail, rate limit, malformed input, etc.).

## Implementation

The harness has a `Spec Lifecycle`, a `Validation Ladder`, and a `Review Gate`,
but no protocol for HOW to write code safely. This section fills that gap.

### Multi-Layer Pre-Flight (MANDATORY before any commit)

Before editing any file, the agent MUST run pre-flight if ANY trigger matches:

1. The task description mentions a system in `docs/MULTI_LAYER_REGISTRY.md`
2. First grep for the user symptom returns hits in ≥2 directories
3. Bug class matches: "X not detected", "silent failure", "works locally fails
   in prod", "regex/allowlist", "env var", "schema/migration mismatch"
4. Change touches `manifest.json`, any `*env*.ts`, any `define:` block, or any
   file containing `allowlist` / `whitelist` / `matches`

The Pre-Flight output is a **Layer Enumeration Block** in the commit message:

```text
## Multi-Layer Pre-Flight

System touched: <name from docs/MULTI_LAYER_REGISTRY.md, or "ad-hoc">
Trigger: <user symptom or task description>

Layer enumeration:
| # | Layer | File(s) | Action | Evidence |
|---|---|---|---|---|
| A | <name> | <path:line> | touched / verified unchanged / N/A | <test or grep result> |
| B | <name> | <path:line> | touched / verified unchanged / N/A | <test or grep result> |

Cross-layer invariant tested:
  $ bash scripts/check-cross-cutting-allowlists.sh
  → exit 0, "3 systems checked, 0 failed"

Layers I deliberately did NOT touch and why:
  - <layer>: <reason>
```

If the system is `ad-hoc` (not yet registered), the agent MUST append an entry
to `docs/MULTI_LAYER_REGISTRY.md` IN THE SAME COMMIT — per Growth Rule, every
new multi-layer system is permanently registered the moment it's discovered.

### Pre-implementation tool selection matrix

| Question agent must answer first | Tool | Why |
|---|---|---|
| "Is this a known multi-layer system?" | `read docs/MULTI_LAYER_REGISTRY.md` | Cheapest first check |
| "What other files reference this symbol/string?" | `grep` (workspace-wide) + `lsp_find_references` | Catches Layer B/C copies before you forget |
| "Does this run in browser AND Node?" | `grep -l "platform.*browser"` + `grep` package consumers | Catches Forbidden #19 surface |
| "Did I solve this bug class before?" | `omo-session-distiller_recall` | Returns past atoms with full Resolution |
| "Are 2+ hypotheses ranked within 2× confidence?" | spawn 2× `explore` agents in parallel, 1 per hypothesis | Per `diagnostic-driven-debugging` Phase 3 |
| "Is this an architectural decision?" | 1× `oracle` (AFTER explores return) | Synthesis, not exploration |

### Anti-pattern: bisecting layer-by-layer

If the agent finds itself making commit #2 or #3 to fix the SAME user-reported
bug, STOP. This is the bisecting-by-commit anti-pattern (Forbidden #20). Either:

- The pre-flight was skipped → run it now, in commit #N+1 enumerate every
  remaining layer
- The system is not yet in the registry → add it now, then enumerate

The 4-commit "extension not detected" chain (session 2026-05-21, commits
`51feecf → f097b42 → 2fc26c8 → be1eca2`) is the canonical violation.

## Evidence Receipt

Every Validation Ladder layer the agent claims to have run MUST emit an
Evidence Receipt — a fenced code block with a strict schema. A textual claim
("typecheck passes") without a Receipt is treated as if the layer was never
run, regardless of how truthful the agent believes the claim to be.

### Required schema

````text
```evidence
layer: validate:quick | test:integration | test:cross-cutting-allowlists | test:e2e | test:e2e:extension | test:real-world | test:landing-self-measure | test:landing-real-browser | test:release
command: <exact shell command including args>
cwd: <relative to repo root>
started: <ISO-8601 UTC>
duration_s: <number>
exit_code: <integer>
artifact_path: <relative path or "none">
stdout_tail: |
  <last 10 lines of stdout, verbatim — DO NOT summarize>
stderr_tail: |
  <last 5 lines of stderr, verbatim>
relevant_assertion: <one-sentence what this Receipt proves about the change>
```
````

### When required

| Change Type | Tiny lane | Normal lane | Multi-layer | High-risk |
|---|---|---|---|---|
| validate:quick | ✓ Receipt | ✓ Receipt | ✓ Receipt | ✓ Receipt |
| test:integration | — | ✓ Receipt | ✓ Receipt | ✓ Receipt |
| test:cross-cutting-allowlists | — | if registry hit | ✓ (mandatory) | if registry hit |
| test:e2e:extension | — | if extension glob | ✓ if extension glob | if extension glob |
| test:e2e | — | if UI change | ✓ if UI | ✓ Receipt |
| test:real-world | — | if URL-consuming | if URL-consuming | ✓ Receipt |
| test:landing-self-measure | — | if apps/website | if apps/website | if apps/website |
| test:landing-real-browser | — | if apps/website | if apps/website | if apps/website |

Tiny lane may omit Receipts only for `validate:quick`. Any layer beyond
`validate:quick` requires a Receipt regardless of lane.

### Anti-cheat: structural checks

The Receipt is parseable; the harness can validate it. CI should reject when:

- Required field missing or wrong type
- `artifact_path` references a non-existent or empty file
- `stdout_tail` lacks the runner's expected output signature (e.g. `vitest`
  output must contain "Test Files"; `tsc` must contain "Found 0 errors" OR a
  `path:line` error). Mismatch flags potential fabrication
- Receipt `started` is older than the most recent commit on the branch
  (operationalises Forbidden #6 backdating)
- For required layers per lane × change-type, a Receipt with `exit_code: 0`
  is missing

Pasting "typecheck passes ✓" without the Receipt = layer was never run.
Forbidden #22 codifies this.

## Sub-agent Fan-out Policy

The agent has 5 sub-agent types (explore, librarian, oracle, metis, momus).
Single-context reasoning misses parallel angles. This section codifies WHEN
to spawn ≥2 sub-agents in parallel — and when not to.

### Mandatory fan-out scenarios

The agent MUST spawn ≥2 parallel sub-agents (fresh contexts, one per angle)
when ANY of:

1. **Change Type = `multi-layer`** OR Pre-Flight enumerated ≥3 layers
   → 1 explore per layer cluster

2. **PR review of `user-feature` / `bug-fix` on a user surface** (UI, CLI
   output, extension popup, MCP tool stdout)
   → 3 explores in parallel:
     - Correctness explore: "diff every allowlist/env/manifest, run typecheck"
     - Security explore: "auth surfaces, token leaks, schema breakage"
     - UX-real-browser explore: "Playwright MCP — click every link, every
       CTA, verify post-click state"

3. **Bug investigation produced ≥2 hypotheses within 2× confidence**
   → 1 explore per hypothesis with falsification test
   (per `diagnostic-driven-debugging` Phase 3)

4. **Cross-package change touching ≥2 of {CLI, MCP, extension, website}**
   → 1 explore per consuming package to map blast radius

### Forbidden fan-out scenarios

The agent MUST NOT spawn parallel sub-agents when:

- Change Type is `docs` or `refactor` with single-file diff
- Pre-flight produced exactly 1 root-cause hypothesis with no competing alternatives
- The change is a documented mechanical follow-up (e.g. version bump per
  pump-version checklist)
- Trivial task (one-line typo, single import add)

Parallel fan-out is **expensive in tokens**. Don't pay the cost for changes
where 1 agent's context is sufficient.

### Aggregation rule

After parallel fan-out, the controller agent MUST:

1. Wait for `<system-reminder>` of completion (never poll `background_output`)
2. Synthesize findings into a single coherent verdict
3. If two explores contradict, spawn 1× `oracle` to resolve — do NOT pick
   a side without that synthesis step

## Review Gate

After user-flow tests pass, a **fresh review agent** verifies the implementation.
The reviewer **must not be** the implementing agent (Forbidden #2).

### Three-Angle Review Protocol (MANDATORY for user-feature/bug-fix)

A Review Verdict of PASS on any change with Change Type = `user-feature` or
`bug-fix` that touches a user surface (web UI, CLI output, extension popup,
MCP tool stdout) is **INVALID unless the verdict cites evidence from all
three angles**:

**Angle A — Correctness**
- typecheck + integration test exit codes (Receipts pasted)
- acceptance-criterion mapping table is complete
- `git diff <base>` reviewed in full (size: N files / M lines)

**Angle B — Security/contract**
- auth/permission surfaces unchanged OR diff explicitly justified
- every allowlist / matches / origins / CSP entry touched is in sync
  (link Multi-Layer Pre-Flight block if applicable)
- no Node-only global leaks (`grep -nE "(^|[^.])(process|Buffer|__dirname|setImmediate)\." <diff>` → 0 unguarded hits)
- no secrets / tokens / keys in diff

**Angle C — Real-user path**
- tool/surface invoked through user's actual entry point (Playwright MCP
  click for UI; live production URL for URL-consuming tools; fresh `npx`
  for CLI)
- console / stdout pasted (≥10 lines, ≤80 lines)
- primary CTA / first invocation produces a usable next state (not generic
  error, not empty)
- all README-documented fields appear in output (Forbidden #14)

Missing any angle → verdict is FAIL with reason "single-angle review".
Session 2026-05-21's landing PR passed Angle A (CLI measure LCP 296ms GOOD)
and shipped 6 user-visible bugs because Angles B and C were skipped. This
is the canonical violation pattern. Forbidden #21 codifies the rule.

### Reviewer handoff protocol

When spawning the fresh reviewer agent, the implementing agent MUST pass:

1. **Context packet**: link to issue + spec + design + diff + every Evidence
   Receipt produced during implementation
2. **Pre-Flight Layer Enumeration** (if multi-layer)
3. **Acceptance criteria** explicit list
4. **Out-of-scope items** the reviewer should NOT block on (with reason)

Reviewer MUST re-run Receipts independently — does not trust implementer's
output verbatim. Same command, same cwd, fresh exit codes.

### Lane × Change Type → review requirement

| Lane | user-feature / bug-fix | multi-layer | infra / refactor / deps | docs |
|------|---|---|---|---|
| tiny | n/a (escalate if user-visible) | n/a (escalate to multi-layer) | self-verify | none |
| normal | 3-angle, single Oracle reviewer | 3-angle, Oracle + 2× explore parallel + Playwright MCP for Angle C | self-verify | none |
| **multi-layer** | (use multi-layer column) | 3-angle, Oracle + 2× explore parallel + Playwright MCP for Angle C + `test:cross-cutting-allowlists` Receipt | Angle A+B, Oracle | n/a |
| high-risk | Full review-work skill (5 parallel) covering A+B+C | Full review-work (5 parallel) + `test:cross-cutting-allowlists` | Angle A+B, Oracle | n/a |

## Review Verdict: PASS | FAIL

```text
## Review Verdict: PASS | FAIL

Reviewer: <fresh agent — name + sub-agent type>
Implementer: <name>  (MUST differ from Reviewer per Forbidden #2)
Date: YYYY-MM-DD
Commit: <sha>
Angles required for this Change Type: a, b, c   (auto-derived from matrix above)

### Angle A — Correctness

```evidence
layer: validate:quick
command: pnpm typecheck && pnpm lint && pnpm test
cwd: .
started: 2026-05-22T10:30:00Z
duration_s: 23
exit_code: 0
artifact_path: none
stdout_tail: |
  Test Files  6 passed (6)
       Tests  94 passed (94)
  Start at  10:30:18
  Duration  981ms
relevant_assertion: All workspace tests pass; no type errors; no lint warnings.
```

(add additional Receipts as required by lane × change-type matrix)

### Angle B — Security / contract

- [x] auth/permission surfaces unchanged
- [x] allowlist sync verified via test:cross-cutting-allowlists (Receipt above)
- [x] no unguarded Node-only globals (grep output below):
  ```
  $ grep -nE "(^|[^.])(process|Buffer|__dirname|setImmediate)\." packages/core/src/
  packages/core/src/engine.ts:393:    typeof process !== "undefined" && process.env ? ...
  packages/core/src/engine.ts:686:        typeof process !== "undefined" && typeof process.version ...
  packages/core/src/calibration.ts:196:    typeof process !== "undefined" && process.env
  → all 3 hits are guarded with typeof check; no unguarded usage
  ```
- [x] no secrets in diff

### Angle C — Real-user path

```evidence
layer: test:landing-real-browser
command: (Playwright MCP) navigate https://hoainho.github.io/ohmyperf/measure/ → snapshot → click Measure CTA → snapshot
cwd: .
started: 2026-05-22T10:32:00Z
duration_s: 8
exit_code: 0
artifact_path: artifacts/review/issue-<N>/playwright-snapshot.yml
stdout_tail: |
  pre-click console: 0 errors
  post-click console: 4 errors (all in allowlist per issue #11)
  post-click view: NoBackendGuide rendered with 3 numbered cards + Download button
relevant_assertion: Click produces usable next state; no console errors outside allowlist.
```

### Acceptance-criterion evidence

| Criterion | Angle | Evidence | Status |
|---|---|---|---|
| "User can install extension via zip download" | C | Playwright snapshot shows "↓ Download v0.2.0.zip" link with href /ohmyperf/downloads/... | ✓ |
| "Extension ID auto-discovered on install" | A,C | extension-bridge.ts streamPort uses runtime-discovered ID (line 365 grep); Playwright reload shows "Extension ready" badge | ✓ |
| "Test smoke suite passes" | A | 6/6 smoke tests pass (Receipt above) | ✓ |

Unmet criteria (if FAIL):
- <criterion> — <which angle is missing> — <what evidence would close it>
```

**Rule:** `openspec archive "<name>"` is forbidden until Review Verdict = PASS
with all required angles checked.

## PR + Bot Review Loop

After the local Review Gate passes, push branch and open a PR. No PR bot configured. Human reviewer follows the same loop manually.

```text
1. Push branch + open PR
        │
        ▼
2. Reviewer posts review comments
        │
        ├── comments substantive ──► agent reads → fix → push
        │                            │
        │                            ▼
        │                   re-run validate + user-flow test
        │                            │
        │                            ▼
        │                   if substantive impl change → re-run Review Gate
        │                            │
        │                            ▼
        │                   wait for bot re-review
        │
        ├── comments stylistic only ─► address inline or reply with reason
        │
        ▼
3. Bot approves → merge → openspec archive "<name>"
```

**Rules for handling PR comments:**

- **Read every comment.** Do not collapse / dismiss without action or reasoned reply.
- **Substantive comment** (correctness, security, missing case): MUST fix.
  After fix, re-run validate + user-flow + Review Gate before pushing.
- **Stylistic comment** (naming, ordering, preference): fix if cheap, or reply
  with reasoning and tag for human review.
- **Disagreement**: do NOT silently dismiss. Reply with rationale; tag human.
- **Loop limit**: max 3 push cycles per PR. After 3, escalate to human review.
- **Never**: force-push to bypass bot, dismiss without reading, or merge
  without bot approval (unless human override documented in PR).

The PR review loop is not optional. It is the final correctness gate before
the change becomes part of the trunk.

## Forbidden Practices

1. **Claiming "tests pass" without output.** Paste the command and its exit code.
   A claim without evidence is not a claim.
2. **Self-review.** The implementing agent must not perform its own Review Gate.
   Use review-work skill or spawn a fresh review agent.
3. **Skipping user-flow tests for "refactors."** If the refactor changes
   observable behavior (response shape, timing, error messages, side effects),
   it needs a user-flow test. Only pure internal refactors (identical I/O)
   qualify as "E2E not applicable."
4. **Happy-path-only E2E for high-risk changes.** High-risk must cover at least
   one error or edge path.
5. **Archiving without review verdict.** openspec archive "<name>" is blocked until
   the story shows Review Verdict = PASS with per-criterion evidence.
6. **Backdating evidence.** Evidence must reference the current implementation
   commit, not a previous passing run.
7. **Force-pushing to bypass PR bot review.** PR bot must approve or be
   overridden by documented human decision.
8. **Dismissing PR comments without action or reasoned reply.** Every
   substantive comment requires a fix or a documented disagreement.
9. **Starting work without a GitHub issue.** Every new user request (except
   pure conversational queries) must have a GitHub issue created BEFORE
   classification. Working without an issue ID = invisible work.
10. **Stale issue.** If implementation progresses but the issue isn't updated
    at the milestones in § GitHub Issue Tracking, the change is in violation.
11. **Claiming a CI gate is "configured" without a green run.** A workflow
    that has never passed is not a gate — it is a wish. For any CI check
    you add: paste a link to the first green workflow run in the story
    Evidence section. The gate does not exist until this proof is provided.
    "Actionlint is wired as CI" is not evidence. A passing workflow run URL is.
12. **Stale documentation that claims features shipped when they are pending.**
    Docs must accurately reflect the CURRENTLY PUBLISHED state, not the
    committed-but-unpublished state. If a feature is committed but not yet
    published:
    - Mark it with `(v0.X.Y, pending publish)` in docs/README.
    - Do NOT present it as if users can install it today.
    - CHANGELOG.md `[Unreleased]` section is the correct location for
      unpublished work. Never add a `[X.Y.Z]` entry for a version not yet
      on the npm registry.
13. **Broken symmetry between parallel workflows.** Any change to a publish/
    deploy workflow MUST be mirrored to all parallel workflows in the same
    commit. `publish-stable.yml` and `publish-beta.yml` must have matching
    Node version, preflight steps, secret names, and fallback logic. Before
    merging any CI change: diff both workflow files and verify parity.
14. **Silent output omission in tools.** When a CLI or MCP tool advertises a
    field in its --help / README / tool description, that field MUST appear
    in stdout (or be explicitly documented as conditional). A tool that
    silently omits a documented field breaks every downstream agent relying
    on that field. Required check after user-flow test: verify every
    documented field appears in the output OR an explicit-absence message
    fires.
15. **Shipping a landing-page change without self-measure proof.** OhMyPerf
    is a perf-measurement tool. Its public landing page is the most-visible
    surface and is implicitly the loudest claim of competence. Any commit
    touching `apps/website/` or any user-facing copy/UI that lands on
    `https://hoainho.github.io/ohmyperf/` must include, in the commit
    message or merged PR description, the result of running
    `ohmyperf measure` against the deployed URL — at minimum the aggregated
    CWV block (LCP / CLS / TTFB / TBT median + CoV), resource count, and
    render-blocking count. If LCP > 2500ms on the landing itself, a tracking
    issue must be filed before the next user-facing change ships. The tool
    must demonstrate competence on its own surface; ship slow demo = ship
    proof the tool doesn't work.
16. **Claiming a UI ships without a real-browser click test.** Passing CLI
    measure (`test:landing-self-measure`) proves the page loads. It does NOT
    prove the page is usable. Dead links, console errors, broken click flows,
    and dead-end empty states are all invisible to CLI measure. A landing
    deploy is NOT complete until the agent has, via Playwright MCP or
    equivalent real browser, (a) loaded the page and counted console errors,
    (b) clicked the primary CTA and verified the post-click view is usable.
    The summary must be pasted into the deploy commit. Session 2026-05-21
    is the canonical case: 6 production bugs (4 dead links, 1 CSS noise,
    1 critical dead-end UX on the Measure button) all passed CLI measure,
    all were caught in one click test. CLI-only proof is necessary but not
    sufficient — pair the two layers always. See `test:landing-real-browser`
    in the Validation Ladder for the procedural steps.
17. **Chrome extension allowlist + ID hardcoded inconsistently.** A Chrome
    extension that talks to a hosted SPA has THREE independent allowlists
    that MUST stay in sync, plus an ID resolution path that MUST handle
    per-user variance. Mismatch on ANY layer = silent rejection +
    "extension not detected" UX with no diagnostic. Session 2026-05-21
    is the canonical case: same single user-reported bug ("No runner
    detected") took 4 fix commits to fully resolve because each layer
    failed independently and the agent did not enumerate all layers up
    front. The required invariants:
    - **Layer A — Manifest `externally_connectable.matches`** in
      `apps/extension-chrome/static/manifest.json`. Chrome's gate. Wrong
      list → message never reaches the service worker.
    - **Layer B — Runtime regex allowlist** in
      `apps/extension-chrome/src/background.ts` (search for
      `MANIFEST_MATCH_PATTERNS`). JavaScript's gate inside the SW.
      Defense-in-depth, but missing entry = silent error response.
      Comment on the array MUST cite Layer A as source of truth.
    - **Layer C — SPA env `NEXT_PUBLIC_EXTENSION_ID`** in
      `apps/website/lib/env.ts` (or wherever the extension ID is read).
      Empty = `pingExtension()` short-circuits to null before ever
      calling `runtime.sendMessage`. Must have a hardcoded default that
      covers Web Store install AND a runtime override path for
      unpacked-extension users.
    - **Layer D — ID discovery for unpacked extensions.** A single
      hardcoded ID can never serve all users (unpacked extensions get
      per-machine IDs derived from the loaded folder). Therefore the
      extension MUST self-announce its `chrome.runtime.id` via
      `chrome.scripting.executeScript` + `window.postMessage` on
      `onInstalled` + `tabs.onUpdated`, and the SPA MUST listen,
      cache in `localStorage`, and prefer the runtime-captured ID over
      any compile-time default. A paste-ID manual override is the final
      fallback.

    When adding a new SPA origin, the agent MUST touch all four layers
    in one commit. When debugging "extension not detected", the agent
    MUST verify every layer before guessing — bisecting one layer at a
    time wastes commits.
18. **`sendMessage`-then-`connect` to a MV3 service worker.** Chrome MV3
    service workers idle out 30 seconds after the last event handler
    returns. `chrome.runtime.sendMessage()` wakes a dormant SW; the SW
    handles the message, calls `sendResponse()`, returns, and immediately
    enters the idle countdown. `chrome.runtime.connect()` does NOT
    reliably wake dormant SWs — Chrome's documented behavior is that
    only sendMessage queues for SW wakeup, connect requires the SW to
    already be alive. The SPA-side pattern
        ack = await sendMessage(measure)
        port = connect(ack.portName)   // ← gap of N ms; SW may be dead
    is a race condition that fails non-deterministically with
    "Could not establish connection. Receiving end does not exist."
    The probability of failure increases with: cold SW (first call),
    `"type": "module"` background (defer-evaluated), low-end machines
    (longer microtask queues), browser memory pressure (aggressive
    reclaim). Session 2026-05-21 is the canonical case: extension was
    correctly installed, ID was correctly resolved, allowlists were
    correct, ping succeeded, but the very first measurement crashed
    because the SW was killed in the ~5ms gap between ack and connect.

    The only correct patterns are:

    Pattern A (connect-first, RECOMMENDED): SPA opens the port FIRST
    via `chrome.runtime.connect()`, then sends the measure request
    THROUGH the port via `port.postMessage()`. The port itself wakes
    the SW, the port keeps the SW alive while a message is in flight,
    and the SW receives the measure request only when it's guaranteed
    alive. Mirrors the WebSocket pattern from
    `chrome-extensions-samples/functional-samples/tutorial.websockets`.

    Pattern B (atomic-callback fusion, ACCEPTABLE for legacy code):
    Call `chrome.runtime.connect()` SYNCHRONOUSLY inside the
    `sendMessage` callback, before the Promise resolves. No microtask
    gap, no await, no React render between ack receipt and connect.
    SW is guaranteed alive because we haven't returned from its
    `sendResponse()` callback yet. Used in v0.2.0 as `startMeasureAndStream`
    (apps/website/lib/extension-bridge.ts) — see commit 27bea87.

    Anti-pattern (NEVER): separate `await startMeasure()` then
    `streamPort(ack.portName)`. Any async work between (state updates,
    storage writes, React re-renders) opens the SW kill window.

    Long-running measurements (>30s) must additionally either:
      - Use `chrome.debugger.attach()` early — Chrome 118+ keeps the
        SW alive while a debugger session is open
      - Send periodic `port.postMessage({type: 'ping'})` keepalive
        every ≤20s
      - Use `chrome.alarms` with periodInMinutes >= 0.5
19. **Node-only globals leaking into a browser bundle.** Any package
    shared between Node and browser surfaces (e.g. `@ohmyperf/core` is
    consumed by both the CLI/runner AND the Chrome extension SW + Next.js
    SPA) MUST NOT reference Node-only globals without a `typeof X !==
    "undefined"` guard. The bundler's `platform: "browser"` setting
    aliases `node:*` module imports but does NOT polyfill **globals**.
    The canonical offenders:
      - `process.env`, `process.version`, `process.platform`,
        `process.versions`, `process.cwd()`, `process.nextTick`,
        `process.exit`, `process.stdout`/`process.stderr`
      - `Buffer` (use `TextEncoder` for byte counting / `Uint8Array`
        for binary data)
      - `__dirname`, `__filename` (use `new URL(import.meta.url)`)
      - `setImmediate` (use `queueMicrotask` or `setTimeout(fn, 0)`)
      - `global.X` (use `globalThis.X`)

    Session 2026-05-21 is the canonical case: `runEngine()` worked fine
    in CLI/Node context but crashed the Chrome extension SW at runtime
    with `ReferenceError: process is not defined`. Four direct uses of
    `process.env`/`process.version` + one `Buffer.byteLength` in
    `@ohmyperf/core` had survived `platform: "browser"` and tree-shaking.
    Commit 9af7824 fixed via 2-layer defense.

    Required practice — defense in depth:

    Layer 1 (source guards): At every Node-API callsite inside packages
    intended for cross-runtime use, guard with `typeof process !==
    "undefined"` (or `globalThis.process` for stricter strict-mode TS).
    For `Buffer`, prefer Web APIs (`TextEncoder`, `Uint8Array`,
    `new URL(...)` etc.). Code is self-documenting and works regardless
    of bundler.

    Layer 2 (bundler `define`): The browser-bundle build config
    (esbuild/Vite/Rollup `define`) MUST stub Node globals at compile
    time so unguarded refs from new code or transitive deps fail at
    build, not at runtime in a user's browser:

        define: {
          "process.env": "{}",
          "process.version": "\"browser\"",
          "process.versions": "{}",
          "process.platform": "\"browser\"",
        }

    Do NOT define `process` itself to `undefined` — that breaks the
    `typeof process !== "undefined"` guards from Layer 1. The two
    layers reinforce each other; either alone is insufficient.

    When adding new methods to a cross-runtime package, the agent MUST
    grep the diff for `process\.|Buffer\.|__dirname|setImmediate` and
    fix-or-guard each hit BEFORE merge. When debugging a browser
    `ReferenceError`, the agent MUST inspect the BUNDLED output (not
    source) with `python3 -c "import re; ..." ` filtered to exclude
    esbuild's `<define:process.X>` comment markers — those are
    replacement evidence, not runtime references.
20. **Touching one layer of a multi-layer system without enumerating all
    layers in the same commit.** Before editing any file that participates
    in a cross-cutting concern (allowlists, env mirrors, message contracts,
    build-time vs runtime config, schema↔migration↔serializer triples), the
    agent MUST produce a Multi-Layer Pre-Flight block (see § Implementation)
    listing every layer and its status (`touched` / `verified unchanged`
    / `N/A`). Bisecting one layer at a time across multiple commits to fix
    the same user-reported bug is the canonical violation pattern. Session
    2026-05-21's "extension not detected" took 4 commits (`51feecf →
    f097b42 → 2fc26c8 → be1eca2`) because the agent did not enumerate up
    front; with this rule it would have been 1 commit. The registry of
    known multi-layer systems lives in `docs/MULTI_LAYER_REGISTRY.md` and
    is appended via the Growth Rule whenever a new one is discovered.
    Enforcement: `scripts/check-cross-cutting-allowlists.sh` runs as the
    `test:cross-cutting-allowlists` Validation Ladder layer.
21. **Single-angle Review Verdict on user-facing changes.** A Review Verdict
    of PASS on any change with Change Type = `user-feature` / `bug-fix` /
    `multi-layer` that touches a user surface (web UI, CLI output, extension
    popup, MCP tool stdout) is INVALID unless the verdict cites evidence
    from all three angles: **(A) Correctness** (typecheck + integration
    test Receipts + acceptance-criterion mapping), **(B) Security/contract**
    (auth surfaces, allowlist diffs, env exposure, schema breakage, no
    unguarded Node globals), and **(C) Real-user path** (real browser click
    for UI; real production URL for URL-consuming tools; real install +
    invoke for CLI/MCP). Missing any angle → verdict is FAIL with reason
    "single-angle review". Session 2026-05-21's landing PR passed Angle A
    (CLI measure LCP 296ms GOOD) and shipped 6 user-visible bugs because
    Angles B and C were skipped. See § Review Gate for the procedure and
    § Sub-agent Fan-out Policy for the mandatory 3-explore parallel
    invocation on PR review.
22. **PASS claim without an Evidence Receipt.** Every Validation Ladder
    layer the agent claims to have run MUST emit an Evidence Receipt — a
    fenced code block with a strict schema (command, exit code, duration,
    last-N-lines of stdout/stderr, artifact path if any). A textual claim
    ("typecheck passes") without a Receipt is treated as if the layer was
    never run, regardless of how truthful the agent believes the claim to
    be. Tiny lane may omit Receipts only for `validate:quick`; any layer
    beyond `validate:quick` requires a Receipt regardless of lane. The
    Receipt is the only audit trail the human reviewer can trust; without
    it, the harness assumes the worst. See § Evidence Receipt for the
    schema and anti-cheat checks (stdout signature, freshness vs HEAD,
    artifact sha).
23. **Misclassifying multi-layer change as normal/refactor/infra to skip
    cross-cutting checks.** Change Type classification is normally
    agent-self-reported. BUT: if the diff touches ANY file glob listed in
    `docs/MULTI_LAYER_REGISTRY.md`, the Change Type is **multi-layer**
    regardless of the agent's initial classification. An agent claiming
    `refactor` or `infra` on such a diff to bypass `test:cross-cutting-
    allowlists` is in violation. Enforcement: the validate:quick gate
    runs `scripts/check-cross-cutting-allowlists.sh` whenever git diff
    affects any registered glob, regardless of declared Change Type.

## GitHub Issue Tracking

Every user request that triggers harness work (not a pure question) gets a
GitHub issue in `hoainho/ohmyperf`. **Create early, update at every milestone.**

### When to create

**Create immediately after Intent Gate, BEFORE Feature Intake classification.**

The issue starts as a skeleton with the raw user request. It evolves as the
flow progresses.

**Skip issue creation for:**
- Pure conversational questions ("how does X work?")
- Read-only exploration that doesn't produce a deliverable
- Interactive setup tasks initiated by the user

When unsure: create the issue. Closing is cheap.

### Issue lifecycle

| Phase | Action | Command |
|-------|--------|---------|
| Intent | Create skeleton issue | `gh issue create --repo hoainho/ohmyperf --title "<intent>" --body "<raw request + assumptions>"` |
| Intake | Add lane + change-type labels | `gh issue edit <N> --add-label "lane:normal,change-type:user-feature"` |
| Proposal | Comment with location | `gh issue comment <N> --body "Proposal: <location>"` |
| Deep-design | Comment with synthesis | `gh issue comment <N> --body "Deep-design: $verdict"` |
| Specs | Comment with acceptance criteria | `gh issue comment <N> --body "Acceptance: ..."` |
| Implementation | Comment per major task | `gh issue comment <N> --body "Implemented: ..."` |
| User-flow test | Comment with proof | `gh issue comment <N> --body "User-flow PASS: ..."` |
| Review Gate | Comment Review Verdict | `gh issue comment <N> --body "Review: PASS — ..."` |
| PR | Link PR to issue | `gh pr create ... --body "Closes #<N>"` |
| Archive | Close issue | auto-closed by PR merge (via `Closes #N`) |

### Labels

Apply `lane:*` + `change-type:*` (+ optional `status:*`) labels as soon as
classification completes. See `scripts/setup_labels.sh` in this skill or run:

```bash
bash ~/.config/opencode/skills/harness-init/scripts/setup_labels.sh hoainho/ohmyperf
```

