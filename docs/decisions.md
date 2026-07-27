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

The project has no Tailwind installation at all — no config, no PostCSS setup, just handwritten CSS split across
`src/styles/` and imported from `globals.css` built on the same custom-property design tokens throughout. Adding
Tailwind at this point would mean rewriting every component's className from scratch, which is a large, risky change for
the "tooling stays small" stance above to absorb for a single typography plugin. The actual need behind reaching for
`@tailwindcss/typography` was real, though: `.summary-body` (the CRS summary HTML) and `.text-version-list` had no CSS
rules at all, so the sitewide reset (`p` margin zeroed, link color/underline stripped) made injected paragraphs run
together and made links invisible. Both now have handwritten rules built on the same design tokens as everything else,
which gets the actual visual outcome without a second styling system running alongside the first.

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

## The Chamber Diagram Is a Schematic, and Says So

The home page's seating chart draws one dot per seated member from the Congress.gov member endpoint
(`/v3/member/congress/{congress}`), grouped into contiguous party blocks across a half-disc. That arrangement is the
convention nearly every published chamber diagram uses, and it is *not* where anyone actually sits: Congress.gov
publishes no desk assignments, and neither chamber seats its members in a tidy party-ordered arc. The chart therefore
carries that caveat in its own caption rather than leaving a reader to assume otherwise — the same stance as
"Educational Status Cues Are Not Legal Status" above, applied to a picture instead of a status string.

The geometry lives in `src/lib/congress/seating.ts`, entirely free of React and of any Congress.gov concern. Seats are
distributed across arcs in proportion to each arc's radius using the largest-remainder method, which is what guarantees
the drawn seats sum to exactly the membership — a round-and-hope split drifts by a seat or two, and in a chamber
diagram a drifted seat is either an unseated member or an empty chair that nobody voted for. Keeping the arithmetic
in a pure module is what makes "every member gets exactly one seat, no two seats overlap, nothing escapes the viewBox"
directly testable.

`currentMember=true` is what makes the request "who holds a seat right now" rather than "everyone who served at any
point in this Congress." Without it, a member who resigned mid-term and the member who replaced them both come back and
the chamber over-counts. (Congress.gov's documentation makes the mirror-image recommendation for *past* Congresses,
where `currentMember=false` yields the complete historical roster — the opposite question from the one this chart asks.)
Vacant seats are simply absent from the diagram rather than drawn as empty placeholders, since the API reports who holds
a seat, not how many seats are authorized.

The House's six non-voting seats — the five Delegates and Puerto Rico's Resident Commissioner — are counted and labeled
separately rather than drawn as ordinary seats, because a diagram that renders all 441 identically quietly asserts
something false about how the chamber votes. The list-level member record doesn't carry the `memberType` field that
would say so directly (that's item-level only, which would mean one extra request per member, ~540 of them), so it's
derived from the represented jurisdiction instead, which determines it unambiguously.

## Preview Seats Are Placeholders, Not a Fictional Roster

Every other preview fixture in this app is a small set of clearly labeled fictional records. A chamber diagram can't
work that way: it needs a full chamber to lay out at all, and a fabricated roster of 535 plausible-looking names,
parties, and districts is a far easier thing to mistake for real data than a labeled placeholder is — especially since a
seating chart specifically invites a person to go find their own representative. So the no-key path fills both chambers
with unattributed "Preview seat N" placeholders, and the party split behind them (`previewChamberPartySplits`) is
deliberately round rather than realistic. Reporting a real-looking party balance would be a factual claim about the
current Congress that a checked-in fixture has no way to keep true. The chart labels the seats as placeholders in the
read-out panel and in its source line, on top of the page-level `DataSourceNotice`.

## The Home Page Costs One More Upstream Round Trip Than It Did

The chamber diagram means the home route now fetches membership alongside the bill snapshot. That is one page-0 request
to read `pagination.count`, then the remaining pages in parallel — three requests total for a seated Congress, on the
same five-minute cache as everything else, and issued concurrently with the bill fetch rather than after it. Well inside
the 5,000/hour quota, and a cheaper addition than the cross-Congress search sweep already documented above. If the home
page ever needs a fourth independent dataset, that is the point to revisit whether these belong in the
scheduled-ingestion path in `docs/architecture.md` instead of on-demand reads.
