# Civic Ledger

[![CI][ci-badge]][ci-workflow]
[![Vercel][vercel-badge]][vercel-workflow]
[![Pages Demo][pages-badge]][pages-workflow]
[![Coverage][coverage-badge]](#quality-checks)
[![Node][node-badge]](.nvmrc)
[![License: MIT][license-badge]](LICENSE)

An accessible, source-conscious front end for understanding the work of the United States Congress. It is designed to
make the legislative process more legible without replacing the official record.

> The app runs with clearly marked preview records until `CONGRESS_API_KEY` is set. Preview content is fictional and is
> never presented as live congressional data.

**[Browse the UI demo →][pages-demo]** — a static build on GitHub Pages. It renders the labeled preview fixtures only:
GitHub Pages cannot hold a server-side API key or run route handlers, so it is the interface, not the live record. See
[Deployment in One Paragraph](#deployment-in-one-paragraph).

## Start Locally

1. Use Node 26 and pnpm 12 (pinned in `.nvmrc` and `packageManager`).
2. Install packages:

   ```bash
   pnpm install
   ```

3. Create your private local environment file:

   ```bash
   cp .env.example .env.local
   ```

4. Add a **newly rotated** Congress.gov key to `CONGRESS_API_KEY` in `.env.local`. Without one, the app still runs — it
   renders labeled preview data instead.
5. Start the app:

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Quality Checks

```bash
pnpm check         # TypeScript + Biome + unit tests with coverage thresholds — the same command CI runs
pnpm build         # Production build
pnpm preview       # Production build, then serve it on port 3001
pnpm test:e2e      # Playwright browser checks
pnpm test          # Unit tests alone, without the coverage pass
pnpm test:coverage # Unit tests with a V8 coverage report
```

`check` runs the coverage pass rather than the bare test run, because the thresholds below are only enforced by the
command that measures them — and a threshold CI does not run is a comment. The measurement costs about two seconds on
the current suite, which is a low price for the difference between a stated guarantee and an enforced one. `pnpm test`
is still there for the inner loop, where the number is not the question.

`test:coverage` reports on every source file rather than only the ones a test happens to import, so a module with no
test at all shows up as a `0%` row instead of being absent from the summary. It writes a browsable report to
`coverage/index.html`.

Statements, branches, functions, and lines all sit at **100%**, and `vitest.config.mts` sets all four thresholds to 100
so a regression fails the build rather than waiting to be noticed in a diff. That number is only meaningful because the
handful of genuinely unreachable guards — `noUncheckedIndexedAccess` fallbacks over indices a loop bound has already
proven valid, and handlers guarding against state their own render condition excludes — are excluded at their own lines
with a `v8 ignore` comment and a stated reason, rather than being hidden inside a slack threshold. Anything reachable
gets a test instead.

To prepare browsers once for local Playwright runs:

```bash
pnpm exec playwright install chromium
```

## What Is Built

| Route                                            | What it is                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `/`                                              | Civic dashboard with an interactive chamber diagram — one seat per sitting member    |
| `/bills`, `/bills/[congress]`                    | Cross-Congress bill directory with search, filtering, and paging                     |
| `/bills/[congress]/[type]/[number]`              | One bill: summary, text, actions, votes, committees, cosponsors, amendments, related |
| `/members`, `/members/[bioguideId]`              | Member directory, service records, sponsorships, and cosponsorships                  |
| `/committees`, `/committees/[chamber]/[code]`    | Committee directory, name histories, subcommittees, and the records referred to it   |
| `/learn`, `/learn/[slug]`                        | Civic glossary and four source-linked learning modules                               |
| `/about`                                         | Methodology: how records are sourced, labeled, and linked back                       |
| `/api/bills`, `/api/bills/search`, `/api/health` | Server proxies — the API key never touches the browser                               |

Behind those routes (the reasoning behind each lives in [docs/data-policy.md](docs/data-policy.md)):

- **A chamber diagram that admits it's a schematic.** One seat per sitting member, with a keyboard-reachable read-out of
  who holds each one. Congress.gov publishes no desk assignments, and the chart says so.
- **Member portraits from the list endpoint**, credited as the API's terms require. Preview placeholders have none.
- **Shareable views on all three directories.** `/bills?q=broadband&stage=law` renders already narrowed, and each
  directory writes its current view back to the address bar.
- **A committee's actual records**: the bills referred to it, its reports, and its nominations, each collection and page
  its own link, and labeled as Congress.gov's order rather than as newest-first.
- **A search that states its own limits.** The bill endpoint has no keyword parameter, so search sweeps each supported
  Congress's most recently active bills and says so.
- **A bill's full record**: roll-call votes named and linked but not tallied, committees with their recorded
  relationship, cosponsors in the publisher's order and never scored, amendments cited and linked, and related measures
  with whoever related them.
- **A stage cue that reads the record**, from the bill's own `laws` field and the Library of Congress's action codes
  rather than the latest action's wording.
- **Counts that say whose count they are**, and long collections capped behind a disclosure that names what's hidden.
- **Four learning modules and a glossary**, each citing its sources. Defined terms are annotated where they're used, as
  links that work on touch and without JavaScript.
- **A header that becomes a drawer on a phone**: the same navigation landmark restyled, and a plain row with JavaScript
  off.
- **A server-only Congress.gov adapter** with runtime validation, caching, timeouts, and a labeled preview fallback on
  every route that can fail, plus loading skeletons on every route that fetches.
- **Cookieless analytics and error reporting with the query string stripped**, so neither a reader's filters nor the API
  key ever reaches either feed.
- **Strict TypeScript, Biome, 100% unit coverage, Playwright smoke and accessibility tests, CI, and Dependabot.** CI
  also builds the static export and refuses dependency versions published in the last 24 hours.
- An initial Drizzle/Postgres schema for future saved bills.

## Documentation

| Document                                     | Read it for                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md) | Boundaries, the Congress adapter, data flow, and shared rules                 |
| [docs/data-policy.md](docs/data-policy.md)   | What this product claims about congressional records — and what it refuses to |
| [docs/deployment.md](docs/deployment.md)     | The two pipelines and how to configure them                                   |
| [docs/roadmap.md](docs/roadmap.md)           | What is deliberately not built yet                                            |
| [CONTRIBUTING.md](CONTRIBUTING.md)           | How to work on this, and where documentation goes                             |
| [SECURITY.md](SECURITY.md)                   | Reporting a vulnerability, and handling the API key                           |

**Start with [docs/data-policy.md](docs/data-policy.md) if you read only one.** It is the product's spine — the
provenance rules, the labeling rules, and the things this app deliberately will not do — and most of the code is written
to keep one of them.

## Deployment in One Paragraph

Civic Ledger holds a secret, uses dynamic route handlers and ISR, and has a Postgres schema waiting for auth. It needs a
real Node server and **cannot** run on a purely static host in its normal configuration. Vercel (or any Node-capable
platform) is the real target; a GitHub Pages workflow publishes a static, preview-data-only demo for UI review, which
should never be represented as the live product. Full instructions and the static build's exact limitations are in
[docs/deployment.md](docs/deployment.md).

## License

[MIT](LICENSE).

<!--
  Badge definitions. Kept here rather than inline so the header stays readable and every line fits the 120-column prose
  width. The three pipeline badges read live from GitHub Actions; the rest are static and are only accurate because
  something in the repo enforces them — the coverage figure by the thresholds in `vitest.config.mts`, the Node version
  by `.nvmrc` and `engines`.
-->

[ci-badge]: https://img.shields.io/github/actions/workflow/status/ehharding/civic-ledger/ci.yml?branch=main&label=CI
[ci-workflow]: https://github.com/ehharding/civic-ledger/actions/workflows/ci.yml
[vercel-badge]: https://img.shields.io/github/actions/workflow/status/ehharding/civic-ledger/deploy-vercel.yml?branch=main&label=Vercel
[vercel-workflow]: https://github.com/ehharding/civic-ledger/actions/workflows/deploy-vercel.yml
[pages-badge]: https://img.shields.io/github/actions/workflow/status/ehharding/civic-ledger/deploy-gh-pages.yml?branch=main&label=Pages%20Demo
[pages-workflow]: https://github.com/ehharding/civic-ledger/actions/workflows/deploy-gh-pages.yml
[pages-demo]: https://ehharding.github.io/civic-ledger/
[coverage-badge]: https://img.shields.io/badge/coverage-100%25-brightgreen
[node-badge]: https://img.shields.io/badge/node-24-brightgreen?logo=node.js&logoColor=white
[license-badge]: https://img.shields.io/badge/license-MIT-blue
