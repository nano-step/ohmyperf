# Security Policy

OhMyPerf takes the security of its measurement engine, share infrastructure, and shipped binaries seriously. This document covers responsible disclosure, supported versions, and the scope of the bounty program.

## Supported Versions

| Version | Supported |
|---|---|
| `1.x` (latest minor) | Yes — full patches |
| `1.x-1` (previous minor) | Yes — security patches only |
| `0.x` (pre-release) | No — please upgrade to a 1.x release |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security reports.** Public issues will be redirected to the channels below and the vulnerability window will be larger than necessary.

Send reports to: **nhoxtvt@gmail.com**

Encrypt sensitive details with the maintainer's PGP key (publish later at `https://ohmyperf.dev/security.asc`). Until the key is published, send a redacted summary in plaintext and the maintainer will reply with an encrypted channel.

Include in your report:

- Affected package(s) and version(s)
- Reproduction steps or proof-of-concept
- The impact you observed (RCE, data exfiltration, secret exposure, denial of service, etc.)
- Suggested remediation if known

You should receive an acknowledgement within **2 business days**. A first-pass triage decision (in scope / out of scope / needs more info) is delivered within **5 business days**.

## Scope

In scope:

- The `@ohmyperf/core` engine and all collectors under `packages/core/`
- `@ohmyperf/driver-playwright` and `@ohmyperf/driver-extension`
- Reporters under `packages/reporter-*`
- The Chrome extension at `apps/extension-chrome/`
- The hosted share-server at `packages/share-server/` (Workers and Node adapters)
- The share-client redaction pipeline at `packages/share-client/`
- The CLI at `apps/cli/`
- The website SPA at `apps/website/`

Out of scope:

- Findings in third-party dependencies that are not exploitable in the OhMyPerf attack surface (please report those to upstream)
- Social-engineering attacks against the maintainer
- Issues that require physical access to a user's machine
- Self-XSS that requires the user to paste attacker-supplied code into their own DevTools

## Disclosure Timeline

OhMyPerf follows a **90-day coordinated disclosure** window by default:

1. Initial report received and acknowledged
2. Triage decision delivered within 5 business days
3. Fix developed and a release scheduled
4. Public disclosure on the earliest of: 90 days from the initial report, or the release that contains the fix

The maintainer may negotiate an earlier or later disclosure date with the reporter for exceptional cases (active exploitation in the wild, fix requires upstream coordination, etc.).

## Bounty

There is no monetary bounty program at this time. Reporters of valid in-scope vulnerabilities will be credited in the release notes and in `docs/security-hall-of-fame.md` once that file is created. The project may add a monetary bounty in a future release.

## Hardening Tracks (Roadmap)

The following hardening items are tracked in the OpenSpec change `add-ohmyperf-mvp`:

- Plugin trust prompt for first-time third-party plugins (`§4.4`, v1.1)
- Password hashing upgrade from SHA-256 to Argon2id on share-server (`§12.2`, v1.1)
- Abuse-domain denylist on share-server (`§12.9`, v1.1)
- OCR-based screenshot redaction acceptance test (`§13.10`, v1.1)

If you are interested in collaborating on any of these, reach out at the email above.
