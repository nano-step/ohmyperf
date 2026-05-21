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

test:release   (before deploy)
  pnpm -r publish --dry-run --no-git-checks   # must exit 0
```

**Lane → required layers:**

| Lane | validate:quick | test:integration | test:e2e | test:real-world | test:landing-self-measure |
|------|:-:|:-:|:-:|:-:|:-:|
| tiny | ✓ | — | — | — | — |
| normal | ✓ | ✓ | — | ✓ (if URL-consuming) | ✓ (if touches apps/website) |
| high-risk | ✓ | ✓ | ✓ | ✓ | ✓ (if touches apps/website) |

Agents must not claim a layer passes until it has been run and output verified.

## Credential-Blocked State

When a required action is gated on a credential only the human can provide
(NPM_TOKEN, Cloudflare API token, VSCode marketplace PAT, etc.):

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
   known to be wrong. State the root cause: "NPM_TOKEN has read-only scope
   on @ohmyperf — E404 on PUT, not E401. Fix: regenerate with Read+Write
   scope per docs/PUBLISH-NPM-TOKEN.md."

## Change Types

The validation ladder is necessary but not sufficient. The **change type**
determines whether user-flow testing and review gate apply.

| Change type | E2E required? | Review gate? | Example |
|-------------|:-:|:-:|---|
| **user-feature** (new behavior, new surface) | ✅ | ✅ | new endpoint, new UI page |
| **bug-fix** (user-visible defect) | ✅ | ✅ | "OTP not arriving", broken response |
| **infrastructure** (migrations, config, deploy) | ❌ smoke test sufficient | ⚠️ self-verify | DB migration, env var change |
| **refactor** (same I/O) | ❌ existing tests pass | ⚠️ self-verify | extract helper, rename internal symbol |
| **docs** (markdown / comments only) | ❌ | ❌ | README, ADR write-up |
| **dependency-bump** | ❌ smoke test | ⚠️ self-verify | upgrade library version |
| **release** (version bump) | ❌ dry-run publish | ✅ | `chore(release): v0.2.0` |

**Combined gate:** Lane × Change Type. Both must pass to proceed.

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
   - Token-based path (current, recurring rotation): [`docs/PUBLISH-NPM-TOKEN.md`](./PUBLISH-NPM-TOKEN.md) — `NPM_TOKEN` secret with Read+Write on `@ohmyperf` scope.
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
  If `NPM_TOKEN` is misconfigured, the workflow fails in <2s with an `::error::` pointing
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

| Changed surface | Tool | Command |
|---|---|---|
| Bot / chat handler | Command simulator | `pnpm --filter @ohmyperf/tests-oopif-corpus test` |
| Web UI | Playwright / Cypress | `pnpm --filter tests-visual-regression test` |
| REST API | API integration test | `pnpm --filter @ohmyperf/tests-oopif-corpus test` |
| Backend-only (no user surface) | Existing integration tests | `pnpm --filter @ohmyperf/tests-oopif-corpus test` |
| LLM / external service call | Live smoke script | `# N/A` |

**Lane × user-flow requirement:**

| Lane | User-flow test required? |
|------|:-:|
| tiny | No (escalate to normal if user-visible behavior changes) |
| normal | Yes — at least 1 test covering the primary changed behavior |
| high-risk | Yes — cover primary + at least 1 error/edge path |

**E2E not applicable**: If change type is infra/refactor/docs/deps, write
"E2E: not applicable — [reason]" in the story Evidence section. The review
gate validates this justification.

**Happy-path-only is insufficient for high-risk**: at minimum cover one
error/edge path (auth fail, rate limit, malformed input, etc.).

## Review Gate

After user-flow tests pass, a **fresh review agent** verifies the implementation.
The reviewer **must not be** the implementing agent.

**What the reviewer checks:**
1. Read `git diff <default-branch>` + the proposal, design, and spec.
2. For each acceptance criterion, find evidence (test output, screenshot,
   command result) that it is satisfied.
3. Produce a verdict: **PASS** (all criteria met with evidence) or **FAIL**
   (list unmet criteria + missing evidence).

**Lane × Change Type → review requirement:**

| Lane | user-feature / bug-fix | infra / refactor / deps | docs |
|------|---|---|---|
| tiny | n/a (escalate if user-visible) | self-verify | none |
| normal | Single Oracle review | self-verify | none |
| high-risk | Full review-work skill (5 parallel sub-agents) | single Oracle | n/a |

**Review output format:**

```text
## Review Verdict: PASS | FAIL

Reviewer: <agent name>
Date: YYYY-MM-DD
Commit: <sha>

| Acceptance Criterion | Evidence | Status |
|---|---|---|
| "Users can upload receipt photo" | test_receipt_upload.py passes (output below) | ✓ |
| "Items appear in inventory" | simulator output shows items listed | ✓ |

Unmet criteria (if FAIL):
- [criterion] — missing [evidence type]
```

**Rule:** `openspec archive "<name>"` is forbidden until Review Verdict = PASS.

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

