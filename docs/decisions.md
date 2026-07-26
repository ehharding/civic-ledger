# First-Draft Decisions

## A Focused Surface Before a Complete Data Warehouse

The initial product focuses on bills, their latest actions, and the legislative path. Congress.gov offers far more
collections, but a broad clone would be difficult to understand and expensive to keep fresh. Members, committees,
nominations, treaties, and roll-call views are future verticals.

## Server Proxy Instead of Client-Side API Calls

Congress.gov keys belong in the request URL, so exposing requests from the browser would expose the key. The server
adapter also gives the UI one stable type and one caching policy.

## Preview Records Instead of Empty State

The visual foundation, responsive behavior, and filtering work without an API key. The UI labels this content as preview
data, and fixture records deliberately link only to the Congress.gov home page so they cannot be confused with official
bill pages.

## Educational Status Cues Are Not Legal Status

The API provides human-written action text. The stage classifier can orient a person, but it cannot safely replace a
legal-status reading. The interface therefore says so and provides the official link prominently.

## PostgreSQL Is Deferred, Not Omitted

There is no value in requiring a database merely to render a public feed. The Drizzle schema establishes the first
user-owned persistence surface, while ingestion tables wait until history, notifications, or high traffic justify a sync
pipeline.

## TypeScript Stays on the 6.x (Classic) Line for Now

TypeScript 7 ships a native, Go-based compiler under the standard `typescript` package name, but it doesn't yet expose
the JS compiler API that Next.js's build-time type-check calls into. Installing it as `typescript` currently makes
`next build` misreport TypeScript as missing and crash
(see [next.js#95400](https://github.com/vercel/next.js/issues/95400)). `typescript` is pinned to `^6.0.3` — the last
classic release — until Next.js adds native TS7 support. Dependabot is configured to ignore `>=7.0.0` bumps for the
same reason.

## Only One Deploy Pipeline Builds on Each Push

Vercel auto-deploys on push by default the moment a repo is imported, independent of `deploy-vercel.yml`. Left as-is,
every push would build twice — once via the Actions workflow (gated on `pnpm check`) and once via Vercel's own Git
integration (not gated on anything). Vercel's automatic Git deployments should stay off; `deploy-vercel.yml` is the
single source of truth for what ships.

## Tooling Intentionally Stays Small

TypeScript, Biome, Vitest, Playwright, Drizzle, and GitHub Actions cover correctness, browser behavior, database
evolution, and CI without a pile of overlapping abstractions. Add Storybook when the component inventory starts to
justify it.

## Bill Content Is a CRS Summary Plus Links, Not Re-Hosted Legislative Text

Congress.gov's `/text` sub-resource doesn't return bill text as JSON — only links to Formatted Text/PDF/XML documents it
hosts itself. Fetching, parsing, and re-hosting those would fight the "official source stays the source of truth" stance
above, add a large and inconsistently-formatted content type to render and store, and duplicate what Congress.gov
already serves well. The bill detail page instead shows the CRS `/summaries` sub-resource (short, plain-English, exactly
the "law wikipedia" framing this project wants) and links out to every official text version for anyone who wants the
primary source. The summary HTML is run through a small allow-listed sanitizer (`src/lib/congress/sanitize-summary.ts`)
rather than a DOM-based library, in keeping with the tooling stance above — CRS summaries use a narrow, well-understood
set of tags, and the API's own docs note the markup isn't always well-formed.

## Congress-Scoped Browsing Is Bounded to What the API Actually Covers

`/bills/[congress]` lets a person browse any Congress, not just the current one, but the picker only offers the 93rd
Congress (1973) onward — where Congress.gov's own bill and resolution records begin (see "About Legislation of the U.S.
Congress," https://www.congress.gov/help/legislation). Earlier Congresses have only partial, largely non-digitized
material the bill list endpoint doesn't cover at all. Every Congress the picker lists therefore resolves to a page that
can show real records once a live key is configured, rather than one the API was never going to return anything for.
The boundary lives in one place (`EARLIEST_COVERED_CONGRESS` in `src/lib/congress/congress-history.ts`) so it can move
if API coverage ever changes.

The preview fallback for this route filters fixture bills to the requested Congress rather than showing the full fixture
set regardless of which Congress was asked for — a bill from a different Congress isn't a preview of this one, and the
"no fixtures for this Congress" case is now a real, reachable state instead of one that could never come up before this
route existed.

## Tailwind Stays Out; `@tailwindcss/typography`'s Job Is Done by Hand-Written CSS

The project has no Tailwind installation at all — no config, no PostCSS setup, just handwritten CSS in `globals.css`
built on the same custom-property design tokens throughout. Adding Tailwind at this point would mean rewriting every
component's className from scratch, which is a large, risky change for the "tooling stays small" stance above to absorb
for a single typography plugin. The actual need behind reaching for `@tailwindcss/typography` was real, though:
`.summary-body` (the CRS summary HTML) and `.text-version-list` had no CSS rules at all, so the sitewide reset (`p`
margin zeroed, link color/underline stripped) made injected paragraphs run together and made links invisible. Both now
have handwritten rules built on the same design tokens as everything else, which gets the actual visual outcome without
a second styling system running alongside the first.

## `date-fns` Powers Data-Freshness Display, Not Bill-Date Formatting

`formatDate`/`formatOrdinal` in `src/lib/format.ts` stay on native `Intl.DateTimeFormat` — they already correctly
handle a subtle UTC rollback bug in Congress.gov's date-only strings, and swapping to date-fns wouldn't improve that.
The genuine use is `DataSourceNotice`'s "Updated 5 minutes ago" line, built on `date-fns`'s `formatDistanceToNow` from
the `retrievedAt` timestamp every snapshot already carried but never displayed anywhere — directly serving this
project's own stated goal that source freshness stay visible in the interface, not just computed and discarded.

## Search Sweeps Every Congress Because the API Has No Keyword Search of Its Own

Congress.gov's `/v3/bill` endpoint can only be filtered by congress and bill type — it has no full-text or keyword query
parameter at all (confirmed against `BillEndpoint.md` and the API's own FAQ material, not assumed). So
`getSearchResults` in `client.ts` approximates a broad search the only way the API allows: it fetches each supported
Congress's most recently active bills (`sort=updateDate+desc`, up to the API's own 250-per-request ceiling) and matches
the query against title, type, number, policy area, and latest action text — the same fields already shown on `BillCard`
and the bill detail page (`matchesQuery` in `src/lib/congress/search.ts`). It cannot see a bill's full legislative text,
and for a large or old Congress it only sees that Congress's most recently touched slice, not literally every bill ever
introduced in it — the result-count copy says as much rather than implying an exhaustive search.

This is materially more expensive than an ordinary page load (one request per Congress, ~27 today), but every one of
those requests goes through the same `fetchBillsPage`/five-minute cache as ordinary browsing already does, rather than
a separate cache policy. Concurrent and repeated searches within that window are served from cache, not re-fetched from
Congress.gov, which is what keeps sweeping "every Congress" on every search well inside the API's 5,000/hour rate limit
rather than something that needs its own throttling.

A query that parses as a bill citation (`parseBillCitation` — "HR 284", "H.J.Res. 66", "119 HR 284") also gets a direct
single-bill lookup, pinned first in the results. That's the one case where the API can answer exactly rather than the
sweep-and-filter approximation above, so it's worth the one extra request.

`BillDirectory` sends every non-empty query to `/api/bills/search` — there's no more client-side instant filter over
whatever happened to already be loaded. The one exception is when that route can't be reached at all (chiefly the static
GitHub Pages demo, which has no server left at request time): the component falls back to filtering its own
already-loaded bills with the same `matchesQuery`, so search still does something rather than going dead in that one
deployment target.
