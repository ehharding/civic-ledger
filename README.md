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

1. Use Node 24 and pnpm 11 (pinned in `.nvmrc` and `packageManager`).
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
pnpm check         # TypeScript + Biome + unit tests
pnpm build         # Production build
pnpm test:e2e      # Playwright browser checks
pnpm test:coverage # Unit tests with a V8 coverage report
```

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

| Route                                            | What it is                                                                         |
|--------------------------------------------------|------------------------------------------------------------------------------------|
| `/`                                              | Civic dashboard with an interactive chamber diagram — one seat per sitting member  |
| `/bills`, `/bills/[congress]`                    | Cross-Congress bill directory with search, filtering, and paging                   |
| `/bills/[congress]/[type]/[number]`              | One bill: CRS summary, official text versions, and an educational journey cue      |
| `/members`, `/members/[bioguideId]`              | Member directory, service records, sponsorships, and cosponsorships                |
| `/committees`, `/committees/[chamber]/[code]`    | Committee directory, name histories, subcommittees, and the records referred to it |
| `/learn`, `/learn/[slug]`                        | Civic glossary and three source-linked learning modules                            |
| `/about`                                         | Methodology: how records are sourced, labeled, and linked back                     |
| `/api/bills`, `/api/bills/search`, `/api/health` | Server proxies — the API key never touches the browser                             |

Behind those routes:

- **A chamber diagram that is honest about being a schematic.** One seat per sitting member, colored by party, with
  hover and keyboard read-out of who holds each seat and a link to their page. Congress.gov publishes no desk
  assignments, and the chart says so.
- **Shareable views on all three directories.** `/members?chamber=senate&party=republican&sort=state`,
  `/bills?q=broadband&stage=law`, and `/committees?type=standing&sort=chamber` render already narrowed, and each page
  writes its own current view back to the address bar as you narrow it.
- **A committee's actual records, not just its counts.** "Bills Referred: 10,205" is a heading over the referrals
  themselves — each naming the measure, what the committee did with it ("Referred To", "Reported By"), when, and linking
  to that bill's own page — alongside the reports it published and the nominations sent to it. Each collection and page
  is its own link (`/committees/house/hsag00?records=reports&page=3`), and the copy says these are paged in
  Congress.gov's own order rather than claiming either end is the most recent, because the API publishes them in no
  documented order and ignores its own `sort` parameter.
- **A search that states its own limits.** Congress.gov's bill endpoint has no keyword parameter, so search sweeps every
  supported Congress's most recently active bills — and the result copy says so rather than implying an exhaustive
  query.
- **Learning modules that cite their sources and state their limits.** Each of the three walks a process step by step,
  ends with primary-source citations naming their publishers, and prints what it deliberately leaves out — including, in
  the voting module, that this app holds no roll-call data at all.
- **A glossary that comes to the reader.** Every word the glossary defines is annotated where it is actually used —
  throughout the lessons, and in a bill's latest action, which is the one line on that page written in Congress's voice
  rather than this app's. Hovering or focusing "cloture" or "markup" shows the definition in place; the word is also a
  link to its full entry, so it works on a touch screen and with JavaScript off. The annotation never rewrites the text
  it runs over, which is checked rather than intended.
- **Loading skeletons on every route that fetches**, and a labeled preview fallback on every route that can fail.
- **A server-only Congress.gov adapter** with boundary types, runtime validation, five-minute caching, request timeouts,
  and a safe preview fallback.
- **Cookieless analytics with the query string stripped**, so a narrowed directory's `?party=`/`?state=`/`?q=` never
  enters the analytics feed.
- **Strict TypeScript, Biome, unit tests, Playwright smoke tests, GitHub Actions CI, Dependabot**, and a health
  endpoint.
- An initial Drizzle/Postgres schema for future saved bills.

## Documentation

| Document                                     | Read it for                                                                   |
|----------------------------------------------|-------------------------------------------------------------------------------|
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
