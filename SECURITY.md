# Security Policy

## Supported Versions

Civic Ledger doesn't yet cut versioned releases — it's pre-1.0 and developed on a single `main` branch. Only the latest
commit on `main` is supported; if you're running an older checkout, please update before reporting.

## Reporting a Vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities.

Instead, use GitHub's private vulnerability reporting:

1. Go to the [Security tab](../../security) of this repository.
2. Click **Report a vulnerability**.
3. Describe the issue, how to reproduce it, and its potential impact.

This is a small, early-stage project maintained on a best-effort basis — there's no formal SLA, but reports will be
acknowledged and triaged as quickly as possible, typically within a few days.

## Scope

Civic Ledger reads public legislative data from the [Congress.gov API](https://api.congress.gov/) and does not currently
handle any user accounts, authentication, or personal data (see `docs/architecture.md` for what's planned versus built).
In scope for reports:

- Anything that could expose the server-only `CONGRESS_API_KEY` to a client
- Injection, XSS, SSRF, or other issues in request handling (`/api/health`, `/api/bills`, bill detail routes)
- Dependency vulnerabilities with a realistic exploit path in this app
- CI/CD or deployment misconfigurations that could leak secrets

Out of Scope: issues in the upstream Congress.gov API itself (report those to the
[Library of Congress](https://www.congress.gov/help/using-data-offsite)), and purely theoretical findings with no
practical impact on this app.

## Handling Secrets

If you're contributing to this repository:

- Never commit `.env.local` or any file containing `CONGRESS_API_KEY`, `DATABASE_URL`, or similar. These are already
  gitignored — keep it that way.
- If a real API key or credential is ever exposed (committed, pasted somewhere public, shared in a bug report, etc.),
  treat it as compromised: rotate it immediately at the source (e.g., regenerate the key at
  [api.congress.gov](https://api.congress.gov/sign-up/)) rather than assuming it's fine because the exposure was
  brief or informal.
