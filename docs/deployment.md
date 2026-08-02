# Deployment

Civic Ledger holds a secret (`CONGRESS_API_KEY`), uses dynamic route handlers and ISR, and runs a scheduled ingestion
job against Postgres. That combination needs a real Node server — it **cannot** run on GitHub Pages or any purely static
host in its normal configuration.

Two pipelines exist for two different purposes. Only the first ships the product.

| Target                        | Workflow                | Data                   | Purpose                       |
|-------------------------------|-------------------------|------------------------|-------------------------------|
| **GitHub Pages**              | `deploy-gh-pages.yml`   | Labeled preview only   | UI/UX preview, portfolio link |
| **Vercel** (or any Node host) | `deploy-vercel.yml`     | Live Congress.gov      | The real deployment           |

## Platform Requirements

- **App:** Vercel or any Node-capable platform running Next.js 16.
- **Database:** managed PostgreSQL (Neon is a natural fit). **Optional** — see
  [Persistence Is Optional](#persistence-is-optional) — and required only for ingestion and, later, saved bills.
- **Jobs:** Vercel Cron, configured in `vercel.json`. A durable queue/workflow provider only once syncs or notifications
  become multistep; one cron-triggered request is not that yet.
- **Observability:** Vercel Web Analytics and Speed Insights ship in the root layout, and `/api/health` reports the
  newest sync run per dataset. Add structured logs, Sentry, and OpenTelemetry before public launch.
- **Secrets:** deployment environment variables only. Never commit `.env.local`.

## Primary: Vercel

Workflow: `.github/workflows/deploy-vercel.yml`. This is the real deployment target. It keeps `CONGRESS_API_KEY`
server-side, and dynamic routes, ISR, and the future `saved_bills`/auth work all function normally.

1. Run `pnpm dlx vercel link` locally to create and link the Vercel project.
2. Add repo secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` under **GitHub → Settings → Secrets and
   variables → Actions**. This is *not* the Vercel dashboard's environment variables, which is a separate place — see
   the next step.
3. Set `CONGRESS_API_KEY` — and, for ingestion, `DATABASE_URL` and `CRON_SECRET` — as encrypted environment variables
   **in the Vercel project settings**, not as GitHub secrets, so no secret ever appears in Action logs.
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

## Persistence Is Optional

Nothing above requires a database, and that is a property worth keeping rather than a gap to close. With `DATABASE_URL`
unset, `getDb()` returns `null`, every stored read reports "nothing on file", and the app behaves exactly as it did
before ingestion existed: live reads with a labeled preview fallback. A blank or whitespace-only value counts as unset,
on the same rule `CONGRESS_API_KEY` follows.

### Provisioning

1. Create a managed Postgres database and copy its pooled connection string into `DATABASE_URL`.
2. Apply the schema:

   ```bash
   pnpm db:migrate
   ```

   Migrations live in `drizzle/`, generated from `src/db/schema.ts` by `pnpm db:generate`. Both are committed, so what
   ran against a database is reviewable in the diff that introduced it.

The pool is deliberately small (two connections, a short idle timeout) and prepared statements are disabled. That last
one is a requirement rather than a preference: managed Postgres is commonly reached through a transaction-mode pooler,
where a prepared statement created on one backend connection is not there on the next one a query lands on — a failure
that appears only under concurrency and only in production.

### Scheduled Ingestion

`vercel.json` schedules `POST /api/ingest` every six hours. The route authenticates with `CRON_SECRET`, which Vercel
Cron sends as `Authorization: Bearer $CRON_SECRET`.

**Check the cadence against your plan before deploying.** Vercel's Hobby tier permits one cron invocation per day and
runs it within an approximate window, so the six-hour schedule above needs a paid plan. On Hobby, either change the
expression to a daily one or point an external scheduler at the endpoint. Nothing breaks on a slower cadence — the
window a sweep asks for is derived from the stored watermark, not from the schedule, so a run that happens a day later
simply asks for a day's worth. What suffers is only how stale the copy can be when Congress.gov goes down.

**Set `CRON_SECRET` or ingestion stays off.** With no secret configured the route answers `503` and runs nothing rather
than defaulting open — there is no configuration in which "no secret set" should mean "anyone may sync". The other two
refusals are distinct on purpose: a wrong credential gets a bare `401`, and a missing database or API key gets a `503`
naming which one, since that is a normal unconfigured state rather than a fault.

To trigger a run by hand:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-deployment.example/api/ingest
```

The response carries one result per dataset. A `500` means *every* dataset failed, which is what a scheduler should
surface as a failed invocation; one dataset failing is a condition the run recorded and the next run can recover from on
its own. Either way the outcome is in `sync_runs` and shows up in `/api/health`.

Other hosts need their own scheduler pointed at the same endpoint — any cron, a platform scheduler, or an external
pinger. Nothing about the route is Vercel-specific except the file that schedules it.

## Secondary: GitHub Pages Static Demo

Workflow: `.github/workflows/deploy-gh-pages.yml`. This publishes a **static demo only**, built with
`STATIC_EXPORT=true`. It always renders the labeled preview fixtures — a static export has no server left at request
time, so it structurally cannot hold `CONGRESS_API_KEY` or serve live data.

Use this only for a UI/UX preview or portfolio link. **Never represent it as the live product.** Enable it by running
the workflow (`workflow_dispatch`) or letting it run on pushes to `main`.

### What the Static Build Changes

- Sets `output: "export"` and the `basePath` for a GitHub Pages project site.
- **Pre-renders a bounded set of pages** via `generateStaticParams`: every preview bill's detail page, one
  bill-directory page per Congress the fixtures cover, and a member page per placeholder member. A static export can't
  look up arbitrary bills, Congresses, or members on demand.
- **Drops `/api/bills`, `/api/bills/search`, `/api/health`, and `/api/ingest`** before building. The first two need to
  read the request URL (for `offset`/`congress`, or `q`), `/api/health` is force-dynamic, and `/api/ingest` reads a
  request header and writes to a database this build has neither of. Pagination is only offered when live data is active
  anyway, and search falls back to filtering the preview bills already on the page, client-side (`matchesQuery` in
  `src/lib/congress/search.ts`) — the same fallback the live app uses if `/api/bills/search` is ever unreachable, so
  this is not a code path invented for the demo.
- **Degrades every directory deep link** to that page's default view, since a static export has no request URL to read
  at build time. This covers both bill-directory routes' `?q=`/`?stage=`, the member directory's
  `?q=`/`?chamber=`/`?party=`/`?state=`/`?sort=`, and the committee directory's `?q=`/`?chamber=`/`?type=`/`?sort=`. The
  controls all still work once the page loads, and all three directories still write their view back to the address bar;
  only pre-filling from the incoming link is lost.
- **Never mounts the analytics or Speed Insights collectors**, so neither script tag is emitted and no request is ever
  made to `/_vercel/…` — a path only Vercel serves, which on GitHub Pages would resolve to this site's own 404 page on
  every route.
- **Lists no individual records in `sitemap.xml`.** There is no database, so the stored-record read returns nothing and
  the file degrades to the constant-derived list it was before ingestion. Its hourly revalidation is likewise inert: the
  export prerenders it once and ignores the interval, which is the correct behavior for a build with no server left to
  revalidate anything.

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
