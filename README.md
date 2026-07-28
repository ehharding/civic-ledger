# Civic Ledger

An accessible, source-conscious front end for understanding the work of the United States Congress. It is designed to
make the legislative process more legible without replacing the official record.

> The app runs with clearly marked preview records until `CONGRESS_API_KEY` is set. Preview content is fictional and is
> never presented as live congressional data.

## What Is in This 1.0 Draft

- A polished responsive civic dashboard at `/`, including an interactive chamber diagram of the current Congress — one
  seat per sitting member, colored by party, with hover/keyboard read-out of who holds each seat and a link to their
  official biography (see [Data Policy](#data-policy) for what the arrangement does and does not claim)
- A cross-Congress bill directory at `/bills` (current Congress) and `/bills/[congress]` (any Congress back to the 93rd,
  1973 — see [Data Policy](#data-policy)), with a Congress switcher, a search box that sweeps every supported Congress
  via a server proxy (`/api/bills/search` — see [Data Policy](#data-policy) for why this is a sweep, not a true
  full-text query), and a "Load More" button that pages through live results when not searching (server proxy at
  `/api/bills`, key never touches the browser)
- Bill-record route with an educational journey cue at `/bills/[congress]/[type]/[number]`, resolved via a direct
  single-bill lookup so any real bill works — not just the dozen most recently returned by the list endpoint
- Individual member route at `/members/[bioguideId]` — portrait, party, seat, term-by-term service record, leadership
  roles, and the legislation they sponsored and cosponsored. Reachable from anywhere a person is named: every seat in
  the chamber diagram is a link, and so is every bill's sponsor line
- Loading skeletons for both bill directory routes, the bill detail route, and the member route
- Civic glossary and methodology routes, plus a first source-linked learning module on the five-stage bill lifecycle
  at `/learn/how-a-bill-becomes-law`
- Server-only Congress.gov API adapter with boundary types, five-minute caching, JSON requests, and safe preview
  fallback
- Initial Drizzle/Postgres schema for future saved bills
- Strict TypeScript, Biome, unit tests (client mapping/lookup logic included), Playwright smoke tests, GitHub Actions
  CI, Dependabot, and a health endpoint
- Two verified deployment pipelines — see [Deployment](#deployment) below

## Start Locally

1. Use Node 24 and pnpm 11 (the versions are pinned in `.nvmrc` and `packageManager`).
2. Install Packages:

   ```bash
   pnpm install
   ```

3. Create Your Private Local Environment File:

   ```bash
   cp .env.example .env.local
   ```

4. Add a **Newly Rotated** Congress.gov Key to `CONGRESS_API_KEY` in `.env.local`.
5. Start the App:

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

To Prepare Browsers Once for Local Playwright Runs:

```bash
pnpm exec playwright install chromium
```

## Data Policy

- Congress.gov is the source of truth for congressional records.
- API calls stay on the server, and `CONGRESS_API_KEY` must never use a `NEXT_PUBLIC_` prefix.
- The client explicitly requests `format=json`, validates the useful shape, maps it into a stable internal model, and
  caches the upstream request for five minutes.
- `inferBillStage` is deliberately presented as an educational cue, not a legal-status determination.
- The home page's chamber diagram is a schematic, not a floor plan. Congress.gov publishes no desk assignments, so
  seats are grouped by party the way chamber composition is conventionally diagrammed, and the chart says so. Members
  come from `/v3/member/congress/{congress}` with `currentMember=true`, so it shows who holds a seat now rather than
  everyone who served during the Congress; vacant seats are absent rather than drawn. The House's six non-voting seats
  are counted and labeled separately. See "The Chamber Diagram Is a Schematic" in `docs/decisions.md`.
- Without an API key the diagram renders unattributed placeholder seats on a deliberately round, illustrative party
  split — never a fabricated roster of member names, and never a real-looking party balance a fixture can't keep true.
- Every bill page retains an official-record link, pointing at the *public* Congress.gov page for that record
  (`https://www.congress.gov/bill/119th-congress/house-bill/284`). It is derived from the bill's own identity rather
  than taken from the API's `url` field, which is a self-referential API endpoint that serves JSON — see "The
  Official-Record Link Is Derived, Not Passed Through" in `docs/decisions.md`.
- Member pages report what Congress.gov publishes — service record, party, jurisdiction, and the legislation a member
  put their name to. There are no vote ratings, effectiveness scores, or ideological placements: those are editorial
  judgments, and this project's stance is that clarity and provenance, not persuasion, are the product.
- Without an API key, member pages exist only for the fictional sponsors the preview bills already name. Their IDs
  (`PREVIEW-1`…) deliberately cannot be valid Bioguide IDs, so a placeholder is never requested from Congress.gov and
  can never render a link to a real person's biography. The chamber diagram's placeholder seats stay unattributed and
  unlinked — see "Placeholder Members Exist Where a Placeholder Roster Still Doesn't" in `docs/decisions.md`.
- Congress-scoped browsing (`/bills/[congress]`) is bounded to the 93rd Congress (1973) onward, matching where
  Congress.gov's own bill and resolution records begin — see `EARLIEST_COVERED_CONGRESS` in
  `src/lib/congress/congress-history.ts`.
- The bill list endpoint has no keyword-search parameter of its own, so search (`/api/bills/search`) sweeps each
  supported Congress's most recently active bills and matches the query against their title, type, number, policy area,
  and latest action text — not a true full-text query of a bill's legislative text. See "Search Sweeps Every
  Congress..." in `docs/decisions.md` for why, and `getSearchResults` in `src/lib/congress/client.ts` for the
  implementation.

The Congress.gov API uses v3, pagination, and an hourly request quota; see the official
[API repository](https://github.com/LibraryOfCongress/api.congress.gov/) before extending ingestion. The 2026 changelog
also explicitly recommends setting the response format rather than relying on the default.
[Changelog](https://github.com/LibraryOfCongress/api.congress.gov/blob/main/ChangeLog.md)

## Deployment

Civic Ledger holds a secret (`CONGRESS_API_KEY`), uses dynamic route handlers and ISR, and has a Postgres schema
waiting for a future auth layer. That combination needs a real Node server — it **cannot** run on GitHub Pages or any
purely static host in its normal configuration. Two pipelines are provided for two different purposes:

### Primary: Vercel (`.github/workflows/deploy-vercel.yml`)

This is the real deployment target. It keeps `CONGRESS_API_KEY` server-side, and dynamic routes, ISR, and the future
`saved_bills`/auth work all function normally.

1. `pnpm dlx vercel link` locally to create/link the Vercel project.
2. Add repo secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (Settings → Secrets and variables →
   Actions in GitHub — **not** the Vercel dashboard's environment variables, which is a separate place; see below).
3. Set `CONGRESS_API_KEY` (and `DATABASE_URL`, once persistence lands) as encrypted environment variables **in the
   Vercel project settings**, not as GitHub secrets, so the key never appears in Action logs.
4. Push to `main` for a production deploy; pull requests get a preview deployment with a URL comment.
5. **Turn off Vercel's own Git-integration auto-deploy** (Vercel dashboard → Project Settings → Git → disable
   automatic deployments for the connected branch). Vercel enables this by default when a repo is imported, and it
   builds independently of the Actions workflow above — left on, every push deploys twice from two separate pipelines,
   only one of which is gated on `pnpm check` passing first.

Any other Node-capable host (Railway, Render, Fly.io, a plain VPS) works the same way — Vercel is just the path with
an official GitHub Action and zero server config.

### Secondary: GitHub Pages Static Demo (`.github/workflows/deploy-gh-pages.yml`)

This publishes a **static demo only**, built with `STATIC_EXPORT=true`. It always renders the labeled preview
fixtures — a static export has no server left at request time, so it structurally cannot hold `CONGRESS_API_KEY` or
serve live data. Concretely, this build:

- Sets `output: "export"` and the right `basePath` for a GitHub Pages project site.
- Pre-renders every preview bill's detail page, one bill-directory page per Congress the preview fixtures cover, and a
  member page per placeholder member, via `generateStaticParams` (a static export can't look up arbitrary bills,
  Congresses, or members on demand).
- Drops the `/api/bills` pagination route and the `/api/bills/search` search route before building — both need to read
  the request URL (for `offset`/`congress`, or `q`, respectively), which a static export can't do. Pagination is only
  offered when live data is active anyway, and search falls back to filtering whatever preview bills are already loaded
  on the page, client-side (`matchesQuery` in `src/lib/congress/search.ts`) — the same fallback the live app itself
  uses if `/api/bills/search` is ever unreachable, so this isn't a separate code path invented just for the static demo.
- Degrades both bill-directory routes' shareable `?q=` deep link to an empty starting search (that fallback search still
  works once the page loads; a static export just can't read the request URL at build time to pre-fill it).

Use this only for a UI/UX preview or portfolio link — never represent it as the live product. Enable it by running the
workflow (`workflow_dispatch`) or letting it run on pushes to `main`.

## Architecture and Scale Path

Read [docs/architecture.md](docs/architecture.md) for the component, data, and deployment shape. Read
[docs/decisions.md](docs/decisions.md) for the deliberate first-draft tradeoffs.

### Recommended Next Milestones

1. Add a normalized ingestion table plus scheduled `updatedSince` refreshes—do not attempt to mirror all Congress.gov
   data on day one.
2. Add sign-in and the `saved_bills` feature.
3. Build additional source-linked learning modules for committees and voting (the bill-lifecycle module now lives at
   `/learn/how-a-bill-becomes-law`).
4. Add a browsable member directory and committee membership, now that individual member pages exist to link into.
5. Add notifications only after freshness, provenance, and opt-in controls are solid.
