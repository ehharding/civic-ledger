# Civic Ledger

An accessible, source-conscious front end for understanding the work of the United States Congress. It is designed to
make the legislative process more legible without replacing the official record.

> The app runs with clearly marked preview records until `CONGRESS_API_KEY` is set. Preview content is fictional and is
> never presented as live congressional data.

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
pnpm check    # TypeScript + Biome + unit tests
pnpm build    # Production build
pnpm test:e2e # Playwright browser checks
```

To prepare browsers once for local Playwright runs:

```bash
pnpm exec playwright install chromium
```

## What Is Built

| Route                                            | What it is                                                                        |
|--------------------------------------------------|-----------------------------------------------------------------------------------|
| `/`                                              | Civic dashboard with an interactive chamber diagram — one seat per sitting member |
| `/bills`, `/bills/[congress]`                    | Cross-Congress bill directory with search, filtering, and paging                  |
| `/bills/[congress]/[type]/[number]`              | One bill: CRS summary, official text versions, and an educational journey cue     |
| `/members`, `/members/[bioguideId]`              | Member directory, service records, sponsorships, and cosponsorships               |
| `/committees`, `/committees/[chamber]/[code]`    | Committee directory, name histories, and subcommittees                            |
| `/learn`, `/learn/how-a-bill-becomes-law`        | Civic glossary and the first source-linked learning module                        |
| `/about`                                         | Methodology: how records are sourced, labeled, and linked back                    |
| `/api/bills`, `/api/bills/search`, `/api/health` | Server proxies — the API key never touches the browser                            |

Behind those routes:

- **A chamber diagram that is honest about being a schematic.** One seat per sitting member, colored by party, with
  hover and keyboard read-out of who holds each seat and a link to their page. Congress.gov publishes no desk
  assignments, and the chart says so.
- **Shareable views on all three directories.** `/members?chamber=senate&party=republican&sort=state`,
  `/bills?q=broadband&stage=law`, and `/committees?type=standing&sort=chamber` render already narrowed, and each page
  writes its own current view back to the address bar as you narrow it.
- **A search that states its own limits.** Congress.gov's bill endpoint has no keyword parameter, so search sweeps every
  supported Congress's most recently active bills — and the result copy says so rather than implying an exhaustive
  query.
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
