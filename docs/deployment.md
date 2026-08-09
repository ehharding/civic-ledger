# Deployment

Civic Ledger holds a secret (`CONGRESS_API_KEY`), uses dynamic route handlers and ISR, and has a Postgres schema waiting
for a future auth layer. That combination needs a real Node server — it **cannot** run on GitHub Pages or any purely
static host in its normal configuration.

Two pipelines exist for two different purposes. Only the first ships the product.

| Target                        | Workflow                | Data                   | Purpose                       |
|-------------------------------|-------------------------|------------------------|-------------------------------|
| **GitHub Pages**              | `deploy-gh-pages.yml`   | Labeled preview only   | UI/UX preview, portfolio link |
| **Vercel** (or any Node host) | `deploy-vercel.yml`     | Live Congress.gov      | The real deployment           |

## Platform Requirements

- **App:** Vercel or any Node-capable platform running Next.js 16.
- **Database:** managed PostgreSQL (Neon is a natural fit) when user-owned persistence begins — see
  [Persistence Plan](architecture.md#persistence-plan).
- **Jobs:** Vercel Cron plus a durable queue/workflow provider, only once syncs or notifications become multistep.
- **Observability:** Vercel Web Analytics and Speed Insights ship in the root layout. Add structured logs, Sentry, and
  OpenTelemetry before public launch.
- **Secrets:** deployment environment variables only. Never commit `.env.local`.

## Primary: Vercel

Workflow: `.github/workflows/deploy-vercel.yml`. This is the real deployment target. It keeps `CONGRESS_API_KEY`
server-side, and dynamic routes, ISR, and the future `saved_bills`/auth work all function normally.

1. Run `pnpm dlx vercel link` locally to create and link the Vercel project.
2. Add repo secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` under **GitHub → Settings → Secrets and
   variables → Actions**. This is *not* the Vercel dashboard's environment variables, which is a separate place — see
   the next step.
3. Set `CONGRESS_API_KEY` (and `DATABASE_URL`, once persistence lands) as encrypted environment variables **in the
   Vercel project settings**, not as GitHub secrets, so the key never appears in Action logs.
4. Push to `main` for a production deploy. Pull requests get a preview deployment with a URL comment.
5. Turn on **Web Analytics** and **Speed Insights** in the Vercel project (their respective tabs). The client code is
   already in place; until they are enabled the injected scripts have nothing to report to, which is harmless. Nothing
   needs enabling on any other host — both components are simply absent there.
6. **Turn off Vercel's own Git-integration auto-deploy** (Vercel dashboard → Project Settings → Git → disable automatic
   deployments for the connected branch).

Step 6 is not optional housekeeping. Vercel enables Git auto-deploy by default the moment a repo is imported, and it
builds independently of the workflow above. Left on, every push deploys twice from two separate pipelines — only one of
which is gated on `pnpm check` passing first. `deploy-vercel.yml` is the single source of truth for what ships.

Any other Node-capable host (Railway, Render, Fly.io, a plain VPS) works the same way. Vercel is just the path with an
official GitHub Action and zero server config.

## Secondary: GitHub Pages Static Demo

Workflow: `.github/workflows/deploy-gh-pages.yml`. This publishes a **static demo only**, built with
`STATIC_EXPORT=true`. It always renders the labeled preview fixtures — a static export has no server left at request
time, so it structurally cannot hold `CONGRESS_API_KEY` or serve live data.

Use this only for a UI/UX preview or portfolio link. **Never represent it as the live product.** Enable it by running
the workflow (`workflow_dispatch`) or letting it run on pushes to `main`.

The build recipe itself lives in `.github/actions/build-static-demo`, a composite action this workflow shares with the
`static-export` job in `ci.yml`. That sharing is the point: this is the one build a change can break while passing
everything else, because `pnpm build` is the *server* build. A new route handler, a fresh `request.url` read, or a
dynamic API compiles, type-checks, and tests clean, then fails only under `output: "export"`. CI runs the identical
recipe on every pull request, so that failure arrives before the change lands rather than on `main` afterward.

### Reproducing the Static Build Locally

The recipe's first step is `rm -rf src/app/api/bills src/app/api/health`, which is safe on a throwaway CI checkout and
is **destructive on a working tree**. To run it by hand, start from a clean tree so the removal is recoverable:

```bash
rm -rf src/app/api/bills src/app/api/health
```

```bash
STATIC_EXPORT=true GITHUB_PAGES_BASE_PATH=/civic-ledger CONGRESS_API_KEY="" pnpm exec next build
```

```bash
git restore src/app/api
```

The result lands in `out/`. Serve it through any static file server — the export has no Node server, so `pnpm start`
cannot host it. Passing `GITHUB_PAGES_BASE_PATH` matters even locally: it is what exercises the prefix-sensitive
output, including the header's plain `<form action>`, the sitemap, and robots.txt.

### What the Static Build Changes

- Sets `output: "export"` and the `basePath` for a GitHub Pages project site.
- **Pre-renders a bounded set of pages** via `generateStaticParams`: every preview bill's detail page, one
  bill-directory page per Congress the fixtures cover, and a member page per placeholder member. A static export can't
  look up arbitrary bills, Congresses, or members on demand.
- **Drops all three route handlers** before building. `/api/bills` and `/api/bills/search` need to read the request URL
  (for `offset`/`congress`, or `q`), and `/api/health` is `force-dynamic` so its timestamp reflects real request
  time — none of which a static export has a server left to do. Pagination is only offered when live data is active
  anyway, and search falls back to filtering the preview bills already on the page, client-side (`matchesQuery` in
  `src/lib/congress/search.ts`) — the same fallback the live app uses if `/api/bills/search` is ever unreachable, so
  this is not a code path invented for the demo. A liveness probe against a static host answers a question nobody is
  asking.
- **Degrades every directory deep link** to that page's default view, since a static export has no request URL to read
  at build time. This covers both bill-directory routes' `?q=`/`?stage=`, the member directory's
  `?q=`/`?chamber=`/`?party=`/`?state=`/`?sort=`, and the committee directory's `?q=`/`?chamber=`/`?type=`/`?sort=`. The
  controls all still work once the page loads, and all three directories still write their view back to the address bar;
  only pre-filling from the incoming link is lost.
- **Never mounts the analytics or Speed Insights collectors**, so neither script tag is emitted and no request is ever
  made to `/_vercel/…` — a path only Vercel serves, which on GitHub Pages would resolve to this site's own 404 page on
  every route.

The member directory is the one surface that behaves identically in both deployments. Its filtering, sorting, and URL
writing are entirely client-side, so once the page loads only the roster behind it differs — and the pre-fill from an
incoming deep link, per the bullet above.

### One Known Trade in the Static Build

The analytics gate is a server-side `STATIC_EXPORT` check, which means it holds at render time rather than at bundle
time. `STATIC_EXPORT` is not `NEXT_PUBLIC_`-prefixed, so the bundler cannot fold the check away. Nothing is mounted, no
script tag is emitted, and no `/_vercel/…` request is ever made — which is the part that matters — but roughly 7 KB of
never-executed collector code still rides along in the demo build's shared client chunk.

Removing it would mean either a second `NEXT_PUBLIC_` flag mirroring the first or a bundler alias in `next.config.ts`,
both of which split one gate across two places to save a couple of kilobytes on the deployment target that is explicitly
a preview. The trade goes the other way, deliberately, and this paragraph is the record of it rather than a silence
someone else has to rediscover.
