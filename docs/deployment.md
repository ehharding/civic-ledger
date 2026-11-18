# Deployment

Civic Ledger holds a secret (`CONGRESS_API_KEY`), uses dynamic route handlers and ISR, and has a Postgres schema waiting
for a future auth layer. That combination needs a real Node server — it **cannot** run on GitHub Pages or any purely
static host in its normal configuration.

Two pipelines exist for two different purposes. Only the first ships the product.

| Target                        | Workflow              | Data                 | Purpose                       |
| ----------------------------- | --------------------- | -------------------- | ----------------------------- |
| **GitHub Pages**              | `deploy-gh-pages.yml` | Labeled preview only | UI/UX preview, portfolio link |
| **Vercel** (or any Node host) | `deploy-vercel.yml`   | Live Congress.gov    | The real deployment           |

## Platform Requirements

- **App:** Vercel or any Node-capable platform running Next.js 16.
- **Database:** managed PostgreSQL (Neon is a natural fit) when user-owned persistence begins — see
  [Persistence Plan](architecture.md#persistence-plan).
- **Jobs:** Vercel Cron plus a durable queue/workflow provider, only once syncs or notifications become multistep.
- **Observability:** Vercel Web Analytics and Speed Insights ship in the root layout, and Sentry reports errors and a
  sampled share of traces — see [Error Reporting](#error-reporting) below. Add structured logs and OpenTelemetry before
  public launch.
- **Secrets:** deployment environment variables only. Never commit `.env.local`.

## Primary: Vercel

Workflow: `.github/workflows/deploy-vercel.yml`. This is the real deployment target. It keeps `CONGRESS_API_KEY`
server-side, and dynamic routes, ISR, and the future `saved_bills`/auth work all function normally.

1. Run `pnpm dlx --allow-build=esbuild vercel link` locally to create and link the Vercel project.
2. Add repo secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` under **GitHub → Settings → Secrets and
   variables → Actions**. This is _not_ the Vercel dashboard's environment variables, which is a separate place — see
   the next step.
3. Set `CONGRESS_API_KEY` (and `DATABASE_URL`, once persistence lands) as encrypted environment variables **in the
   Vercel project settings**, not as GitHub secrets, so the key never appears in Action logs. Set `NEXT_PUBLIC_SITE_URL`
   there too, to the origin the site is actually served from, with no trailing slash. It is the only variable here whose
   absence is invisible: `getSiteUrl` (`src/lib/site.ts`) falls back to Vercel's injected `*.vercel.app` hostname, so a
   custom-domain deployment without it renders perfectly while every canonical URL, sitemap entry, and share card names
   a host the reader did not visit. Leave it unset on preview deployments, where the per-deployment fallback is the
   correct answer.
4. Push to `main` for a production deploy. Pull requests get a preview deployment with a URL comment.
5. Turn on **Web Analytics** and **Speed Insights** in the Vercel project (their respective tabs). The client code is
   already in place; until they are enabled the injected scripts have nothing to report to, which is harmless. Nothing
   needs enabling on any other host — both components are simply absent there.
6. **Vercel's own Git-integration auto-deploy is off**, via `"git": { "deploymentEnabled": false }` in `vercel.json`.
   Nothing to do here: it is checked in. Do **not** disconnect the repository in Project Settings → Git to get the same
   effect; the connection is what ties each deployment to its commit, and the setting above leaves it in place.

Step 6 is not optional housekeeping. Vercel enables Git auto-deploy by default the moment a repo is imported, and it
builds independently of the workflow above. Left on, every push deploys twice from two pipelines that do not build the
same thing: the workflow runs `vercel build` inside the GitHub runner, where the three `SENTRY_*` values live, so it is
the only one of the two that uploads source maps — and it is the one whose build a reviewer can read the log of.
`deploy-vercel.yml` is the single source of truth for what ships.

**Neither pipeline waits for `pnpm check`.** `ci.yml` and `deploy-vercel.yml` are separate workflows on the same
triggers, so they run in parallel and a deploy can finish while the quality job is still going — or after it has gone
red. What CI gives you is a failing check on the commit, not a block on the deploy; branch protection on `main` is what
turns that check into a gate, and it belongs in the repository's settings rather than in a workflow file.

### Keeping Server Work Bounded

The Hobby plan's limits that matter here are **Fluid Active CPU**, ISR writes, and the Congress.gov key's hourly quota,
and crawlers are what threaten all three: a route that renders per visit pays a full render for every URL a crawler
walks, and a crawler walking bill pages across old Congresses spends the API quota and writes ISR pages nobody reads
back. Exceeding the CPU limit pauses the whole team (`402 DEPLOYMENT_DISABLED` on every URL). Most of that traffic comes
from clients that do not identify as bots, so `robots.txt` alone does not bound it.

What keeps it bounded:

- **Plain routes are static.** No directory or record route reads its query, so each is prerendered and regenerated at
  most once per five-minute window. In `pnpm build`'s route table, the only `ƒ (Dynamic)` entries should be the `/api/*`
  route handlers and the `/query/*` twins. CI holds that: `pnpm check:routes` runs after the build in the `quality` job
  and fails on a per-visit route anywhere else (`scripts/check-route-rendering.mts`). Run it locally after `pnpm build`
  when a change touches a route, a layout, or anything they fetch through.
- **Only a URL carrying a view renders on demand.** `next.config.ts` rewrites a URL holding one of a route's own params
  to its twin under `src/app/query/`, which renders the narrowed view server-side. The rewrite is a routing rule rather
  than a Proxy, so the static half costs no function invocation at all. A query the route ignores (`?utm_source=`) is
  served the static page. See `src/lib/query-routes.ts`.
- **AI training crawlers are refused the whole site.** One training crawler alone can cross the Hobby limits.
  `robots.txt` disallows `/` for GPTBot and the other documented training-only crawlers (`AI_TRAINING_CRAWLERS` in
  `src/app/robots.ts`). Search and user-fetch agents (`OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Googlebot`) are
  untouched, since they are how readers find the site. The list is short on purpose: `robots.txt` only binds crawlers
  polite enough to read it. Enforcement is the Vercel Firewall's **AI Bots** managed ruleset, set to **AI Crawlers →
  Deny** and **AI Assistants → Log**, whose bot list Vercel maintains and which stops a crawler before any function
  runs, whether or not it honors this file.
- **Crawlers are kept off the query variants.** `robots.txt` disallows `/query/` and each route's `?` form. Those pages
  already canonicalize to the plain route, so they were never going to be indexed — they were only ever going to be
  rendered.
- **Record links do not prefetch on sight.** `next/link` prefetches every link that scrolls into view, and for a bill,
  member, or committee page that is not cached yet that prefetch is a server render — scrolling `/members` would render
  every member page passed. Links to individual records, and to a committee's query-carrying tabs and pager, go through
  `RecordLink` (`src/components/ui/record-link.tsx`), which prefetches only once a pointer or finger reaches the link.
  (Plain `prefetch={false}` would also turn off hover prefetching in the App Router.) Use it for any new link to a
  record; plain `next/link` stays right for links to the static top-level routes.
- **A concluded Congress is cached for a day.** Its record is closed, so `/bills/118`, every bill page under it, and
  that Congress's slice of the search sweep are regenerated daily rather than every five minutes. Only the Congress now
  sitting stays on the five-minute window. `revalidateSecondsForCongress` in `congress/upstream/http.ts` decides which.
  Most of what crawlers walk is concluded Congresses.
- **A bill page's requests are not cached twice.** Crawlers walk bill pages across every Congress, almost never
  repeating, and each cold render would write eight Congress.gov responses into the metered Data Cache for nothing. A
  concluded Congress's bill page makes those requests uncached (`billPageCacheWindow` in `congress/upstream/http.ts`);
  its segment `revalidate` still holds the page for a day. The sitting Congress keeps its five-minute fetch window.
  `getBillById`, `getMemberProfile`, and `getCommitteeProfile` are memoized per render with React's `cache`, because
  Next's fetch memoization skips requests carrying an abort signal, and every request here carries one.
- **A failed read is never cached.** On a production server, a cached route whose Congress.gov read failed throws
  `LiveDataUnavailableError` instead of rendering preview data, and Next keeps serving the last good copy (a route with
  no copy yet shows the error page, which is a 500 and uncached). The record pages' metadata refuses too, so a failed
  lookup cannot title a real bill "Bill Not Found". The `/query` twins are never cached, so they still render the
  labeled preview. `next build` is exempt, so a rate-limited API cannot fail a deploy. See
  `src/lib/congress/live-render.ts`. These refusals reach Sentry as issues; during a quota outage expect one per route
  that tried to revalidate, all with the same message.
- **Crawlers stay off a concluded Congress's bill records.** `robots.txt` disallows `/bills/*/` and allows back the
  sitting Congress and the next (`billRecordRules` in `src/app/robots.ts`). Those pages are the long tail, about ten
  thousand per Congress back to the 93rd, and each cold one cost a render, an ISR write that was rarely read again, and
  up to eight API requests. Every Congress's directory stays crawlable.
- **A bill page looks the bill up before anything else.** A failed lookup refuses the render after one request instead
  of eight, and a collection the record publishes with a count of `0` is not requested at all. An absent count is not
  treated as zero: whether Congress.gov omits an empty collection or publishes `0` has not been confirmed against a live
  response. If it turns out to omit them, skipping on absence would save most of the remaining requests, at the cost of
  trusting that omission.
- **Unidentified crawlers are rate-limited at the edge.** `robots.txt` binds only clients that read it. A Vercel
  Firewall custom rule on the project limits each IP to 40 requests per 60 seconds on paths starting with `/bills/`,
  answering `429` past that, before any function runs. A reader never comes close; a hover-prefetch that hits the limit
  just fails quietly. It is configured in the dashboard (Firewall → Configure → New Rule), not in this repository, so
  check it is still there after any change to the project's firewall.
- **The homepage ships only what the seating chart draws.** The chart is a client component, so its props travel in the
  RSC payload. `compositionForSeating` strips the portraits it never shows — about a seventh of the most-served page's
  compressed size.
- **The API routes are cached at the CDN.** `/api/bills` and `/api/bills/search` read their query, so Next leaves them
  uncached; they send `s-maxage` for the shared five-minute window (`src/lib/edge-cache.ts`), so a repeated request is
  answered by the CDN. Search matters most: each call reads up to 250 bills from every supported Congress.
- **One deployment per push, and none for a docs-only one.** See step 6 above. `deploy-vercel.yml` skips a push or pull
  request touching only `docs/` or Markdown, which would ship an identical bundle whose on-demand pages all start
  uncached.

If every page shows preview data while the key is set, search the runtime logs for `congress.request-failed`: a `status`
of `429` means the key's hourly quota is spent, and it recovers on its own within the hour. A quota that keeps running
out can be raised by asking api.data.gov, which issues Congress.gov keys.

If the team is paused, the dashboard's **Usage** tab names the metric that tripped it. Upgrading to Pro lifts a pause;
so, sometimes, does asking Vercel support to reset it once the cause is fixed.

Any other Node-capable host (Railway, Render, Fly.io, a plain VPS) works the same way. Vercel is just the path with an
official GitHub Action and zero server config.

## Error Reporting

Sentry is wired for all three runtimes: the browser (`src/instrumentation-client.ts`), the Node server and the edge
runtime (`src/instrumentation.ts`, which imports `src/sentry.server.config.ts` and `src/sentry.edge.config.ts`). All
four are thin — the configuration itself lives in `src/lib/observability/sentry-options.ts`, which is where to look and
where to change things.

**Two channels, and the distinction matters when reading an incident.** _Issues_ are crashes: something threw, an error
boundary caught it, and there is a stack trace. _Logs_ are handled failures, which in this app means almost
everything — `requestCongressJson` turns every upstream failure into `{ outcome: "failed" }` so a page degrades instead
of crashing, which means a Congress.gov outage throws nothing, reaches no error boundary, and appears **only** as
structured logs. An empty issue stream during an outage is the system working; the logs are where to look. They carry an
`event` attribute (`congress.request-failed`, `error-boundary.caught`) and a `reason` (`http-status`, `schema-mismatch`,
`transport`) to filter on.

`reason: "schema-mismatch"` is the one worth alerting on. It is logged at `error` where the others are `warn`, because
it means a 200 whose body no longer matches `src/lib/congress/upstream/api-schema.ts` — Congress.gov changed its
contract, or this app reads it wrongly — and nothing retries its way out of that. Its symptom without a report is a page
section that is permanently and silently empty.

**Read [An Error Report Names a Page, Never a Query](data-policy.md#an-error-report-names-a-page-never-a-query) before
changing any of it.** Sentry's defaults would send both the Congress.gov API key and the reader's search terms, and the
code that prevents that is not optional.

### Setup

1. Create the Sentry project. Set its name to `civic-ledger` **before** clicking Create — Sentry pre-fills a generic
   `javascript-nextjs`, and that string becomes the project slug used in URLs and in `SENTRY_PROJECT`.
2. Copy the DSN from **Settings → Projects → civic-ledger → Client Keys (DSN)**.
3. Set the variables below. Which of the two places each one belongs in follows from **when it is read**, not from how
   sensitive it is: the three `SENTRY_*` values are consumed by `next.config.ts` during the build, and `vercel build`
   runs that build inside the GitHub runner — so the runner's environment is what the config sees. Everything
   `NEXT_PUBLIC_` is read at runtime by the deployed app, which is Vercel's environment.

   | Variable                                | Where                       | Required             | Purpose                                             |
   | --------------------------------------- | --------------------------- | -------------------- | --------------------------------------------------- |
   | `NEXT_PUBLIC_SENTRY_DSN`                | Vercel env vars             | yes                  | Where events are sent. Unset means Sentry off.      |
   | `NEXT_PUBLIC_SENTRY_ENVIRONMENT`        | Vercel env vars             | strongly recommended | `production` / `preview`. See below.                |
   | `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Vercel env vars             | no                   | `0`–`1`. Defaults to `0.1`; a bad value falls back. |
   | `SENTRY_ORG`                            | GitHub Actions **variable** | for maps             | Organization slug (e.g. `ehharding`).               |
   | `SENTRY_PROJECT`                        | GitHub Actions **variable** | for maps             | Project slug (e.g. `civic-ledger`).                 |
   | `SENTRY_AUTH_TOKEN`                     | GitHub Actions **secret**   | for maps             | Authorizes the upload. Never `NEXT_PUBLIC_`.        |

   All three GitHub values live on the same page — **Settings → Secrets and variables → Actions** — on its two tabs.
   Only the token is a secret. The slugs are variables because they are not credentials (both are already visible in any
   Sentry URL) and because GitHub masks a secret wherever it appears in a log: a secret org slug turns "uploading to
   organization ehharding" into "uploading to organization `***`" in precisely the failed-upload log someone is reading
   to find out which organization it tried.

   All three are optional. Without them the build still succeeds and the app still reports; only the source-map upload
   is skipped, which is the difference between a stack trace naming `bills/reads.ts` and one naming
   `page-4f2a9c.js:1:28471`.

   **Set `NEXT_PUBLIC_SENTRY_ENVIRONMENT` per environment** — `production` on the production environment, `preview` on
   preview — even though nothing fails without it. `getSentryEnvironment` falls back to `NEXT_PUBLIC_VERCEL_ENV`, but
   Vercel's published system-variable list documents `VERCEL_ENV` without promising the `NEXT_PUBLIC_` twin that a
   browser bundle needs, and the failure is silent: production crashes filed under "development", mixed in with whatever
   a contributor's laptop sent. One variable removes the doubt.

   Leave `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` unset unless you are deliberately tuning it. The built-in `0.1` is the
   considered default, and pinning the same number in a dashboard only creates a second place to change it.

   Create it as an **organization token**, at
   [Settings → Developer Settings → Organization Tokens](https://sentry.io/orgredirect/organizations/:orgslug/settings/auth-tokens/).
   Its permissions are fixed to what CI needs, and it belongs to the organization rather than to a person, so it does
   not stop working when someone's account does. The token is shown **once**, at creation; if it is lost, revoke it and
   issue another.

4. Nothing needs enabling in the Sentry UI. The scrubbing this project relies on is in code, deliberately, so that it
   shows up in a diff rather than in a dashboard setting someone can flip.

An unset DSN is a supported state rather than a misconfiguration: it is how a local checkout stays out of the shared
project's issue stream, and it is why `.env.example` ships the variable empty.

## Health Check

`GET /api/health` answers with a fixed shape and makes no upstream call:

```json
{ "status": "ok", "service": "civic-ledger", "records": "live", "timestamp": "2026-08-21T12:00:00.000Z" }
```

`status` is liveness — the server answered. **`records` is the field worth alerting on**, and it exists because this
app's central design decision has an operational blind spot on the other side of it. A missing or blank
`CONGRESS_API_KEY` is not an error here: nothing throws, no request fails, no page 500s, and no Sentry event is raised.
The site renders labeled preview fixtures and keeps doing so indefinitely. Every ordinary signal stays green while the
deployment publishes fiction — which is the exact failure mode of a key that expired, was rotated without being updated,
or was dropped from an environment during a migration.

So alert on `records != "live"` in production. It is the difference between noticing that within a minute and noticing
it when a reader asks why a bill from last week is missing. The field reads configuration state only; it never discloses
the key, and a site in preview mode already says so in a banner on every page.

It deliberately does **not** report whether Congress.gov is reachable — that would make this app's liveness depend on a
third party's and turn every probe into traffic against the API's rate limit. Upstream trouble is a separate signal and
has one already: the `congress.request-failed` logs described above.

## Secondary: GitHub Pages Static Demo

Workflow: `.github/workflows/deploy-gh-pages.yml`. This publishes a **static demo only**, built with
`STATIC_EXPORT=true`. It always renders the labeled preview fixtures — a static export has no server left at request
time, so it structurally cannot hold `CONGRESS_API_KEY` or serve live data.

Use this only for a UI/UX preview or portfolio link. **Never represent it as the live product.** Enable it by running
the workflow (`workflow_dispatch`) or letting it run on pushes to `main`.

The build recipe itself lives in `.github/actions/build-static-demo`, a composite action this workflow shares with the
`static-export` job in `ci.yml`. That sharing is the point: this is the one build a change can break while passing
everything else, because `pnpm build` is the _server_ build. A new route handler, a fresh `request.url` read, or a
dynamic API compiles, type-checks, and tests clean, then fails only under `output: "export"`. CI runs the identical
recipe on every pull request, so that failure arrives before the change lands rather than on `main` afterward.

### Reproducing the Static Build Locally

The recipe's first step is `rm -rf src/app/api/bills src/app/api/health src/app/query`, which is safe on a throwaway CI
checkout and is **destructive on a working tree**. To run it by hand, start from a clean tree so the removal is
recoverable:

```bash
rm -rf src/app/api/bills src/app/api/health src/app/query
```

```bash
STATIC_EXPORT=true GITHUB_PAGES_BASE_PATH=/civic-ledger CONGRESS_API_KEY="" pnpm exec next build
```

```bash
git restore src/app/api src/app/query
```

The result lands in `out/`. Serve it through any static file server — the export has no Node server, so `pnpm start`
cannot host it. Passing `GITHUB_PAGES_BASE_PATH` matters even locally: it is what exercises the prefix-sensitive
output, including the header's plain `<form action>`, the sitemap, and robots.txt.

### What the Static Build Changes

- Sets `output: "export"` and the `basePath` for a GitHub Pages project site.
- **Pre-renders a bounded set of pages** via `generateStaticParams`: every preview bill's detail page, one
  bill-directory page per Congress the fixtures cover, and a member page per placeholder member. A static export can't
  look up arbitrary bills, Congresses, or members on demand.
- **Drops the `/query` twins** before building (`src/app/query`). They exist only to be reached through rewrites,
  which a static export has no server to apply; every deep link in the demo renders the default view.
- **Drops all three route handlers** before building. `/api/bills` and `/api/bills/search` need to read the request URL
  (for `offset`/`congress`, or `q`), and `/api/health` is `force-dynamic` so its timestamp reflects real request
  time — none of which a static export has a server left to do. Pagination is only offered when live data is active
  anyway, and search falls back to filtering the preview bills already on the page, client-side (`matchesQuery` in
  `src/lib/congress/bills/search.ts`) — the same fallback the live app uses if `/api/bills/search` is ever unreachable,
  so this is not a code path invented for the demo. A liveness probe against a static host answers a question nobody is
  asking.
- **Degrades every directory deep link** to that page's default view, since a static export has no request URL to read
  at build time. This covers both bill-directory routes' `?q=`/`?stage=`, the member directory's
  `?q=`/`?chamber=`/`?party=`/`?state=`/`?sort=`, and the committee directory's `?q=`/`?chamber=`/`?type=`/`?sort=`. The
  controls all still work once the page loads, and all three directories still write their view back to the address bar;
  only pre-filling from the incoming link is lost.
- **Never mounts the analytics or Speed Insights collectors**, so neither script tag is emitted and no request is ever
  made to `/_vercel/…` — a path only Vercel serves, which on GitHub Pages would resolve to this site's own 404 page on
  every route.
- **Carries no error tracker.** A Turbopack `resolveAlias` swaps `@sentry/nextjs` for
  `src/lib/observability/sentry-stub.ts`, a file of no-ops, so the SDK is absent from the bundle rather than merely
  inert. A static export has no server at request time and never holds a DSN, so the real SDK would initialize, find
  nothing to report to, and do nothing — after costing about 65 KB gzipped, close to a third of the demo's JavaScript.
  Unlike the analytics gate below, this one resolves at bundle time, which is why it removes the code instead of just
  not running it.

The member directory is the one surface that behaves identically in both deployments. Its filtering, sorting, and URL
writing are entirely client-side, so once the page loads only the roster behind it differs — and the pre-fill from an
incoming deep link, per the bullet above.

### One Known Trade in the Static Build

The analytics gate is a server-side `STATIC_EXPORT` check, so it holds at render time rather than at bundle time:
nothing is mounted and no `/_vercel/…` request is made, but roughly 7 KB of never-executed collector code still rides in
the demo's shared client chunk. Removing it would take a second `NEXT_PUBLIC_` flag or a bundler alias — one gate split
across two places — to save a few kilobytes on a preview build. Sentry gets that alias anyway because its cost is ten
times larger (the bullet above).
