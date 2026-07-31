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
with unattributed "Preview Seat N" placeholders, and the party split behind them (`previewChamberPartySplits`) is
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

## Member Pages Link Inward Before They Link Outward

`/members/[bioguideId]` gives every person named anywhere in the app a page of their own, reachable from any seat in
the chamber diagram and from a bill's sponsor line. Before it existed, both of those pointed straight out to the
Biographical Directory — which answers "who is this person" but not "what else have they introduced," and takes the
reader off the site to do it.

The sponsor line therefore now links to the member page rather than to bioguide.congress.gov. Nothing is lost by the
change: the member page carries the official-biography link onward, alongside the member's own house.gov/senate.gov
site when the record has one. The route is keyed on the Bioguide ID for the same reason `bioguideUrl` was — it is
already unique and, unlike a name slug, never changes.

Chart seats are real SVG `<a>` elements rather than click handlers, so a seat can be opened in a new tab, copied, or
followed by a crawler. That does mean a full page load instead of client-side navigation: inside `<svg>` React creates
the anchor in the SVG namespace, where `next/link`'s navigation has nothing to attach to. Behaving like a link
everywhere is worth more than the transition. `Enter` on a seat is consequently left to the browser rather than
intercepted, since intercepting it would break open-in-new-tab; the read-out lock that `Enter` used to perform survives
only on placeholder seats, which have nowhere to go.

A browsable directory of those pages now exists at `/members` — see "The Directory Reuses the Chamber Diagram's Roster"
below — so a member page's backlink points there rather than at the home page. "Back" from one person is far more
usefully the list of everyone than the front door, particularly for a reader who arrived from a bill's sponsor line and
would otherwise have no sideways move available.

The page reports service and leaves scoring alone — no vote ratings, effectiveness scores, or ideological placement.
Those are editorial judgments, and this project's stated position is that clarity and provenance, not persuasion, are
the product. It says so in its own closing card rather than leaving the omission to be inferred.

## Placeholder Members Exist Where a Placeholder Roster Still Doesn't

"Preview Seats Are Placeholders, Not a Fictional Roster" above stands: the no-key chamber diagram is still filled with
unattributed "Preview Seat N" placeholders, and those seats are deliberately *not* links, because they name nobody.

Member pages for the seven fictional sponsors already printed on `previewBills` are a different and much smaller claim.
A reader who clicks a sponsor's name has already been shown a labeled preview bill; a chamber diagram of 535 plausible
names invites someone to look up their *own* representative and be quietly misinformed about who that is. Giving a page
to a name the fixtures already print doesn't add a claim the fixtures weren't already making.

Two safeguards keep the fiction unmistakable, both structural rather than editorial:

- **The IDs cannot be real.** `PREVIEW-1` and friends fail `isBioguideId`, which only accepts the letter-plus-six-digits
  form Congress.gov issues. That single guard means a placeholder is never sent upstream *and* never produces a
  Biographical Directory link — the page cannot point at a real person's biography even by mistake.
- **No official website.** Same reasoning as the fixtures' bare congress.gov link: a fabricated deep link is the easiest
  way for preview content to be taken for the official record.

## The Official-Record Link Is Derived, Not Passed Through

Congress.gov's `url` field on a bill record is a *self-referential API* link
(`https://api.congress.gov/v3/bill/119/hr/284?format=json`), not the public page a reader wants. Passing it straight
through to `LegislativeBill.officialUrl` meant the bill detail page's "Open the Official Record" link — the single most
important link in an app whose whole premise is source provenance — served raw JSON, or a 403 to anyone without an API
key of their own.

`congressGovBillUrl` in `src/lib/congress/types.ts` now derives the public URL
(`https://www.congress.gov/bill/119th-congress/house-bill/284`) from the bill's own identity, which `mapCongressBill`
already requires to be present before it will map a record at all. An unrecognized bill type falls back to the
Congress.gov home page rather than emitting a confidently wrong deep link — the same instinct behind the preview
fixtures' home-page links. The fixtures themselves are hand-written records that never pass through the mapper, so they
keep their bare home-page link and gain no plausible-looking deep link from this change.

## Member Routes Stay Out of the Sitemap

The sitemap enumerates every supported Congress because that list is computed — `listCongresses` derives it from a fixed
constitutional cadence with no I/O — which is what lets `sitemap.ts` stay `force-static` and work in the static export.

Members are bounded (~540) and individually useful, so they look like they belong there. They don't, yet: knowing who
currently holds a seat requires a live Congress.gov request, which would make sitemap generation depend on an API key
and a healthy upstream at build time. That is a meaningful new failure mode for a file whose entire job is to be
cheaply and reliably generated. Every member page is already reachable from the chamber diagram and from the bills its
member sponsored, which is the same reasoning that keeps individual bill records out. Revisit this alongside the
scheduled-ingestion path in `docs/architecture.md`, where a roster will already be on hand locally.

The `/members` directory route itself *is* listed, and it strengthens the case for leaving the individual pages out:
the route is fixed, needs no key to resolve, and is now a single crawlable page that links to every member — which is
what a crawler actually needed, without making sitemap generation depend on a live upstream.

## The Member Directory Filters in the Browser

`/bills` and `/members` are both directories with a search box, and they work in opposite ways on purpose.

Bills number in the hundreds of thousands, and Congress.gov has no keyword-search parameter, so bill search has to be a
debounced request to a server-side sweep ("Search Sweeps Every Congress..." above). A Congress is a little over 540
people. The whole roster is already in memory once the composition resolves, and it is already being serialized into
the page to draw the grid — so it is handed to the browser whole, and every subsequent search, chamber toggle, party
choice, and state selection runs there instantly. No request per keystroke, no debounce, no loading state, no failure
mode when a route handler is unreachable, and nothing to special-case for the static export: the member directory is
the one directory in this app that behaves identically in the GitHub Pages demo and the live deployment.

That is why the narrowing rules live in `src/lib/congress/member-filter.ts`, pure and importing nothing server-side —
the same boundary `search.ts` keeps for bills, and for the same reason: a client component must be able to import them
without dragging the adapter, and the API key it reads, into the browser bundle.

Free-text search covers a member's name and the jurisdiction they represent, including the seat as it reads on screen —
so "Ohio", "9th district", "at-large", and "non-voting" all find what a reader would expect. Party is deliberately
excluded from it, because party has a dedicated filter beside the box and matching it in free text would make typing
"d" return every Democrat alongside everyone whose name happens to contain the letter.

## A Narrowed Directory Is a Place, So It Has a URL

Every directory in this app can now be linked to in a particular state: `/bills?q=broadband&stage=law`,
`/members?chamber=senate&party=republican&sort=state`, `/committees?type=standing&sort=chamber`. None could before,
and the bill directory's part of that gap is the clearest illustration of why it mattered. `/bills` could already
*receive* a `?q=` link — the site header's search form has always sent one — but nothing in the app ever *produced* one,
so a reader who found something worth sharing had no way to hand it to anyone. A page that can be arrived at in a state
it can't be left in is a page whose address bar is lying about where you are.

Two mechanical decisions follow from the member directory's existing "filters in the browser" stance, and they are the
whole reason this is cheap:

- **`history.replaceState`, not a router navigation.** `router.replace` re-runs the route on the server. Doing that on
  every keystroke would undo the entire point of a directory that narrows without a request, and on `/bills` it would
  fight the debounced search that component already does carefully. `replaceState` changes the URL and nothing else:
  no request, no re-render, no loading state. The URL here is a *record* of client state, not an instruction to fetch
  something, and it is written with the API meant for exactly that.
- **`replace`, not `push`.** Typing seven letters into a search box should not leave seven entries for the back button
  to walk out of.

The parsers are total, in the same sense `src/lib/api-query.ts` already describes its own: an absent, malformed, or
stale param resolves to a usable default rather than an error. A shared link is exactly the kind of URL that gets
hand-edited, truncated by a chat client, or opened a year later, and none of those should produce anything worse than
the unfiltered page. `?state=` goes one step further and is validated against the jurisdictions the roster actually
contains — matched case-insensitively, so `?state=ohio` resolves to the roster's own `"Ohio"` — because a value the
control has no option for would leave the `<select>` showing one thing while the grid showed another. That is a worse
failure than ignoring an unusable param, and it is the specific reason `/members` resolves its URL *after* the roster
rather than concurrently with it.

Resolving the link server-side is what costs something, and it is worth naming: `/members` used to be prerendered and
is now rendered on demand, because a route that reads `searchParams` has to be. The alternative was to read the params
in the browser instead and keep the page static, at the price of every shared link rendering the full roster and then
visibly narrowing after hydration — and of the link doing nothing at all without JavaScript. That trade goes the other
way here for the same reason the site header's search is a real `<form>` rather than a click handler: a link should
arrive at what it says it points to, on the first paint, whatever is or isn't running. The upstream cost is unchanged
either way, since the roster still comes through the adapter's shared five-minute cache; what changed is a server
render per visit, not a Congress.gov request per visit.

Each directory's URL spelling lives next to its rules rather than in the route: `MEMBER_DIRECTORY_PARAMS` and
`memberDirectoryQueryString` in `member-filter.ts`, `BILL_DIRECTORY_PARAMS` and `billDirectoryQueryString` in
`search.ts`. Both cross a boundary — the server parses them out of the request, the browser writes them back — so they
belong to neither side, and a param name typed twice is a link that looks right and restores nothing.

## The Facet Lists Say What They Will Do Before You Pick Them

Three changes to the member directory's controls, all aimed at the same thing: a reader should be able to predict what
a choice does without trying it.

**Every option carries its count.** "Ohio (15)" is the difference between a list you can plan a narrowing with and one
you have to probe. It also does quiet work for the party control, whose order is `partySeatingOrder` — the same
left-to-right order as the home page's chamber diagram and its legend. That order is only legible *with* the counts:
"Democratic (213), Independent (2), Republican (220)" is plainly the chart's order, while the same three words alone
are plainly nothing in particular. The alternative — reordering the parties by size — would have made the control
disagree with the chart a reader had just looked at, to fix a problem the counts fix without the disagreement.

**States and territories are grouped rather than interleaved.** A flat alphabetical run of fifty-six entries puts
American Samoa, the District of Columbia, and Guam in among the states, so a reader scanning for a state passes items
that aren't one, and a reader looking for a territory can't tell which are even represented without reading the whole
list. The split is exactly `isNonVotingJurisdiction` — the same distinction the chamber diagram already draws — which
makes it a fact about the chamber rather than an editorial grouping.

**The roster can be reordered.** Alphabetical is the right default and stays the default, but "by state" answers a
question alphabetical can't ("who represents this part of the country"), and it tiebreaks on district so a delegation
reads 1st, 2nd, 3rd — the state's own map — rather than as an alphabetized list that happens to share a state. Every
comparator falls through to the name comparison, so no sort leaves a group of ties in whatever arbitrary order they
arrived in.

Reordering in place is *not* the WCAG 3.2.2 (On Input) pattern the Congress picker has to advise about: nothing
navigates and the reader stays where they were. It does still need announcing, which is why the chosen order is named
in the result-count line — already a live region — rather than only being visible in the grid. It is named only when
it isn't the default, so the common case stays a plain count instead of restating "alphabetical" on every page load.

## Jurisdiction Casing Is Normalized at the Boundary, Not at the View

`normalizeJurisdiction` title-cases the represented state, territory, or district in `mappers.ts`, alongside the
`normalizePartyName` and `type.toUpperCase()` normalizations already there. Doing it at the mapping boundary rather
than at each render is not a formatting preference; it is the only place that fixes the actual bug.

The jurisdiction is the value the member directory's state filter is *keyed on*. If `"NEW YORK"` and `"New York"` were
ever to arrive on different records, the facet list would offer two New Yorks, each returning half the delegation, and
neither would be wrong from the control's point of view. Casing the string once, in the model, means the facet list,
the filter comparison, the card, and the seat description agree by construction — which is the same argument
`docs/architecture.md` makes for maintaining one stable model in general, applied to a field that turned out to be an
identifier as well as a label.

`toTitleCase` is deliberately narrow about what it will touch. A word that is already mixed case is left exactly as it
arrived, because that casing was a decision someone made (`"McCarthy"`, `"DeSoto"`); a dotted initialism is
upper-cased whole (`"u.s."` → `"U.S."`); small words stay lower in the middle of a label but not at either end
(`"District of Columbia"`). It is applied only to full jurisdiction *names* — the two-letter postal code a bill's
sponsor record carries is left alone, since title-casing `"OH"` produces `"Oh"`.

## A List Documented as "Most Recent First" Is Sorted, Not Hoped For

`MemberProfileResult`'s `sponsored` and `cosponsored` fields were documented as "most recent first" and nothing sorted
them; the page rendered whatever order the API returned. Congress.gov does return these lists newest first, so this
was not visibly broken — which is exactly the problem. A promise kept by an upstream convention is one that breaks
silently the day the convention does, on a page where the ordering is the only thing telling a reader which of a
member's bills is recent.

`compareBillsByRecency` now orders both lists, falling back to the latest action's date for a record carrying no
introduction date and sorting a record with neither last rather than into an arbitrary position. The preview path
sorts on the same rule, since a fixture's ordering is no more authoritative than an upstream one. Note what this is
not: the request is already capped at `MEMBER_LEGISLATION_LIMIT`, so this orders the page it was handed and makes no
claim to have re-ranked a larger set it never asked for.

## The Directory Reuses the Chamber Diagram's Roster Rather Than Adding an Endpoint

`getMemberDirectory` calls `getCongressComposition` — the same `/v3/member/congress/{congress}` read, with the same
`currentMember=true` filter, on the same cache tag and five-minute window — instead of issuing its own request. Two
things follow, both of which were the point:

- **It costs nothing extra upstream.** Within the cache window, a visitor who lands on the home page and then opens
  `/members` makes no additional Congress.gov requests at all. Adding a page did not add a quota cost.
- **The two views cannot disagree.** A separate fetch could return a different roster on either side of a membership
  change, and "the diagram shows 435 seats but the directory lists 434 people" is exactly the kind of quiet
  inconsistency that erodes trust in a source-provenance product.

It also inherits the diagram's honest limits rather than restating them: this is who holds a seat *now*, not everyone
who served during the Congress, and vacant seats are absent rather than listed. The directory says so in its own scope
note rather than leaving a reader to assume a complete historical roster.

One rule is the directory's own. A member whose upstream record carries no Bioguide ID is dropped at the boundary
(`buildMemberDirectory`) rather than rendered, because a directory exists to reach a person's page and a row that opens
nothing is dead weight. That rule is what makes the preview path a genuinely separate branch: every placeholder seat in
the diagram is unattributed and ID-less, so a preview directory built from the composition would be empty. It is built
from `previewMemberProfiles` instead — the same seven placeholder people the preview bills already name, and the same
ones their member pages already exist for. The scope note says they are placeholders and that some no longer hold a
seat, rather than filtering the fixtures down to fake a shape they were never built for.

## The Summary Sanitizer Assembles Its Output Instead of Patching Its Input

`sanitizeSummaryHtml` used to run one `.replace()` across the raw fragment, rewriting each tag it recognized and
leaving everything else alone. "Everything else" was the problem: a `<` that began no valid tag was not matched, so it
was forwarded to the browser untouched.

That is enough to reconstruct a live element out of a dead one. Given
`<i<img src=x onerror=alert(1)>mg src=x onerror=alert(1)>`, the pattern matched the inner `<img …>` and stripped it —
correctly, since `img` is not allow-listed — which spliced the surviving `<i` and `mg src=x onerror=alert(1)>`
fragments together into a working `<img onerror>`. Sanitizing the input was what produced the payload. A second bypass
needed no splicing at all: the pattern required whitespace between a tag name and its attributes, so `<svg/onload=…>`
matched nothing and passed through verbatim, never meeting the allow-list.

The sanitizer now walks the input once and *builds* the output: text between recognized tags is escaped, and only a
recognized, allow-listed tag is re-emitted as markup. A `<` that begins no valid tag becomes `&lt;` and renders as the
character it is. Nothing reaches the browser as markup unless this file put it there deliberately, which closes the
overlapping-tag class as a class rather than closing the two payloads that happened to find it.

Two smaller decisions fall out of that:

- **The ampersand is not escaped.** CRS summaries carry real entities — `&amp;` in "AT&T", `&nbsp;`, `&lt;` — and
  escaping `&` would turn each one into visible literal text. An unescaped `&` cannot begin an element, so the safety
  cost is nil.
- **The `href` on an anchor escapes `&` before `"`.** In the other order, the `&quot;` produced by the second pass
  would be re-escaped by the first into a visible `&amp;quot;`.

This stays hand-written, consistent with "Tooling Intentionally Stays Small" above, because the input shape is narrow
and the dependency-free constraint is a real one. But the tradeoff should be named honestly rather than assumed
settled: a hand-written sanitizer is only ever as good as the bypasses someone thought to test, and the six regression
cases beside it are precisely the record of which ones have been. If this is ever pointed at markup from a less
predictable source than Congress.gov, that reasoning expires and a DOM-based sanitizer is the correct answer.

## The Committee Directory Lists Parents and Folds Subcommittees Into Them

Congress.gov's `/v3/committee/{congress}` endpoint returns subcommittees as *peers* of their parents: the House
Agriculture Committee and its six subcommittees arrive as seven records in one flat array, distinguishable only by a
`parent` field on six of them. Rendered as it arrives, that puts "Livestock and Foreign Agriculture Subcommittee" in
the same alphabetical run as the Judiciary Committee, as though a reader were being offered a choice between two
comparable bodies. They are not comparable: a subcommittee only means anything in relation to its parent.

So `buildCommitteeDirectory` keeps the records with no `parent` and drops the rest. Nothing becomes unreachable —
every parent's page lists its subcommittees, each linking to a page of its own — and every card carries the count, so
the directory states how much sits one level down rather than silently flattening it away. The scope note says the
same thing in words, because a reader who counts 20-odd House committees where they expected 150 rows deserves to know
why rather than to wonder.

The same reasoning is why `"Subcommittee"`, a documented value of the API's own `committeeTypeCode`, is not one of this
app's `committeeTypes`. Being a subcommittee is a fact about a record's relationship to another record, and this app
models it structurally. A type that restated it would be a second answer to the same question, free to disagree with
the first.

## Committee Names Are Displayed Verbatim, and Rewritten Only for Search

The same committee is published under two word orders depending on where you meet it. The list endpoint says
`"Agriculture Committee"`. A bill's referral line, the chambers' own sites, and the committee's item-level
`officialName` all say `"Committee on Agriculture"`. A reader who copies a referral line off a bill page and pastes it
into the committee search box is searching for a string that appears nowhere in the list data.

The first attempt at this rewrote the name for *display*, moving a trailing "Committee" to the front. That is wrong,
and a component test caught it: "Committee" is part of the proper name of some bodies rather than a suffix on a
subject, so the rewrite turned the Joint Economic Committee into "Committee on Joint Economic". Nothing in the string
distinguishes the two cases, and a project whose claim is that you can check it against the record should not be
inventing names for the bodies in it.

So the app displays whatever Congress.gov published, and `committeeSearchTerms` confines the rewrite to matching, where
a variant that reads oddly costs nothing because nobody ever sees one. A visible consequence worth naming: the
directory card and the committee's own page can show the same committee under different word orders, because the list
and item endpoints publish it differently. Both are verbatim, which is the property that matters.

## The Committee Page Has No Roster, and No Deep Link

Two things a reader might reasonably expect on a committee page are deliberately absent.

**No membership.** Congress.gov's committee endpoints publish no roster. Assembling one by inference — from members'
own records, from bill referrals, from anywhere — would be the single most plausible-looking fabrication this app could
ship, because a list of names under a committee heading reads as a fact whatever caveat sits beside it. The page says
what the API says and stops.

**No per-committee link to congress.gov.** Their committee URLs take the form `/committee/house-agriculture/hsag00`: a
name slug, then the system code. The slug is not published by the API, and deriving it from the name is guesswork that
diverges further the longer the name gets. A guessed slug that happens to be wrong produces a link that looks
authoritative and lands on a 404, which is worse for this project than one extra click. The page links Congress.gov's
committee index and prints the system code beside it, which is the thing that actually identifies the committee at the
destination.

What the page does carry instead is the committee's recorded name history, which is the most genuinely educational
thing the API publishes about one. A committee's jurisdiction is usually rewritten by renaming it — "Committee on
Education and Labor" becoming "Committee on Education and the Workforce" and back again tracks which party held the
chamber, not a clerical tidy-up — and that story is invisible from a current name alone.

## Five Destinations Is Where the Header Stops Sharing a Line

The site header is a three-column grid: wordmark, nav, search. Below 900px the search is hidden; below 640px the nav
used to wrap in place, right-aligned under the wordmark. That worked at four destinations and stops working at five —
squeezed into the column beside the wordmark, the labels wrap into a ragged two- or three-line block hanging off the
right edge, and every destination added after that makes it worse.

Adding `/committees` is what forced the question, and the fix chosen is the one that scales rather than the one that
defers: below 640px the nav takes a full-width row of its own, left-aligned under the wordmark. Five labels fit on one
line on any phone wider than about 340px, and below that they wrap to a tidy left-aligned second line instead of a
staircase. The cost is roughly 12px of a sticky header, taken deliberately — the alternative was shrinking type
already set at 0.78rem.

The alternatives considered and rejected: a horizontally scrollable strip (hides destinations behind an affordance CSS
can't conditionally show, since a fade would dim the last item even when nothing is overflowing), and a disclosure menu
(a tap to reach any destination, plus JavaScript and focus management, for a nav that still fits). A sixth destination
would fit the new row too. A seventh wants a different pattern, and the comment on `NAV_LINKS` is the marker for
whoever gets there.

## One Collator, One Date Order, for the Whole App

`members.ts` carried a long, correct note explaining why its member ordering runs through a locale-pinned
`Intl.Collator` rather than a bare `localeCompare`: the server sorts the roster before serializing it and the browser
re-sorts the same list, `localeCompare` uses the *runtime's* locale, and where the two disagree the client-rendered
order differs from the server-rendered one — a hydration mismatch across the whole grid. `"Ødegård"` sorts before
`"Zimmerman"` under `en-US` and after it under `da-DK` or `sv-SE`. No sitting member's name triggers it today, which is
exactly the point: the failure arrives with a new member rather than with a code change, and only for some readers.

The argument was right and the reach was short. `committees.ts` held a byte-identical second collator, and four other
orderings — the member directory's state sort, its jurisdiction facet list, and both comparisons behind the seating
chart — used a bare `localeCompare` anyway. The seating one mattered most: that chart is laid out on the server and
again in the browser, so a locale disagreement moves ~540 seats between the two renders.

So there is now one `compareText` in `format.ts`, holding the collator and the reasoning, and every alphabetical
ordering in the app goes through it. A rule that lives in one place is a rule that applies everywhere, rather than one
that applies wherever someone remembered to reach for it.

The same consolidation happened to dates, in the other direction. Three separate comparators sorted records newest
first — `compareBillsByRecency`, `sortByDateDesc`, and the search-result ordering — each with slightly different
handling of a missing date, and two of them reached for `localeCompare` while their own comments claimed plain string
comparison. `compareIsoDatesDesc` states the rule once: every date this app sorts on is fixed-width, zero-padded, and
most-significant-field-first, so direct comparison already *is* chronological order. Collating them would cost more and
buy nothing on ASCII digits. Undated records falling last stops being a special case in each caller and becomes a
consequence of the ordering, since an empty string is less than every real timestamp.

## The Directories Reconcile With the URL Through One Shared Hook

"A Narrowed Directory Is a Place, So It Has a URL" describes what each directory does with the address bar, and why the
reconciliation runs in *both* directions: a component that only writes the URL silently overwrites every change the
router makes, so following the header's own nav link from an already-narrowed directory appears to do nothing, and Back
and Forward move the URL without moving the grid.

That logic — a `lastWritten` ref, a three-case effect deliberately unkeyed so it can see a soft navigation, and a
`popstate` listener — is subtle enough that it was worth writing carefully once. It had instead been written twice,
verbatim, in the member and committee directories. The bill directory had only the write half, and so still had exactly
the bug the other two had already diagnosed and fixed: from `/bills?q=broadband`, clicking "Bills" in the header
soft-navigates without remounting the component, which then writes its stale query string straight back over the URL
the router had just set.

`useDirectoryUrlSync` is that state machine, stated once, with the reasoning attached. All three directories use it,
which both removes the copy and fixes the third. Each directory still owns the *spelling* of its own view — its param
names, its serializer, its parser — because what a view means is that directory's business; only the reconciling is
shared.

Giving the bill directory a client-side parser needed one further change. Its query param was parsed by
`parseQueryParam` in `src/lib/api-query.ts`, which is zod-backed and server-oriented; importing it into a client
component would have pulled that schema validation into the browser bundle, which is the precise thing
`MAX_MEMBER_QUERY_LENGTH` exists to avoid. So `search.ts` gained `parseBillDirectoryQuery` and its own length cap,
matching its two peers, and `resolveBillDirectoryQuery` now goes through the same parser the browser does. All three
directories are one shape again.

## The Shared Control Surface Is Named for What It Is

The bill, member, and committee directories are meant to be the same page in three subjects — same search field, same
filter pills, same facet dropdowns, same "Clear Filters" — and their stylesheets say so in three separate comments. But
the facet rules were named `.member-facet`, `.member-facets`, `.member-facets__clear`, and lived in `member.css`, while
dressing all three. `committee.css` had to point at `.member-facet` and explain that this was fine.

This is the same problem `.stage-filters` had before it became `.segmented-filter`: a committee's type dropdown wearing
a class named after members is the kind of thing that sends someone looking for a bug that isn't there. The rules are
now `.directory-facet*` and live in `directory.css` beside `.directory-search`, `.segmented-filter`, and
`.directory-result-count`, which are the classes they were always siblings of.

Moving them also retired a cross-file source-order dependency. The facet width override sat in `member.css` and worked
only because that file is imported after `directory.css`, where the shared dropdown rule it overrides lives — a comment
had to explain the ordering. Both rules are now in one file, where the override sits a few lines below the rule it
overrides and needs no explanation beyond that.

One misnomer was fixed at the same time: the committee directory's own `<section>` carried `className="member-directory"`.

## The Three Directories Share a Vocabulary, Not Just a Resemblance

`search.ts`, `member-filter.ts`, and `committee-filter.ts` each opened with a paragraph asserting that the three
directories are the same design in three subjects: same wildcard sentinel, same facet-option shape, same total parsers,
same only-write-what-isn't-default serialization. Every one of those paragraphs was true, and every one of them was the
*only* thing making it true.

Concretely, what the three files actually held between them: three declarations of `"all"` under two different names
(`ANY_FACET`, `ANY_COMMITTEE_FACET`, and a bare string literal in the bill directory), two byte-identical generic
facet-option types, three separate `200`-character query caps each with a comment explaining that it matched the other
two, and seven parsers whose bodies were the same four lines with a different union substituted in.

That is the same shape as the problem "One Collator, One Date Order, for the Whole App" describes, and it deserves the
same answer. `directory-filter.ts` states the shared vocabulary once — the sentinel, the facet-option type, the cap,
the free-text parser, the enum parser every facet and sort param resolves through, and the query-string terminator —
and the three modules import it. The sameness is now something the type system holds rather than something three
paragraphs promise.

Two things stayed deliberately unshared, and the line between them is the point:

- **What a view means is each directory's own business.** Param names, facet unions, sort orders, and comparators all
  stay put. A generic "filters" abstraction spanning one directory's three facets, another's two, and a third's one
  would be a worse fit than three explicit declarations, and it would make each directory harder to read in order to
  make them look alike.
- **`src/lib/api-query.ts` keeps its own `MAX_QUERY_LENGTH`.** It bounds the same text where that text reaches a
  *request* rather than a URL, and it is zod-backed and server-oriented — importing it from an isomorphic module would
  pull schema validation into the browser bundle behind it, which is the exact thing the per-directory caps existed to
  avoid. The dependency runs one way on purpose.

The same argument applies one layer up, in the markup. `directory-controls.tsx` already held the search field and the
segmented filter every directory opens with; the facet dropdown, the sort control, the "Clear Filters" action, and the
result-count line were written twice, once in each of the two faceted directories. They are now stated once beside
their siblings — which is the same move `directory.css` made when `.member-facet` became `.directory-facet`, and the
same one `useDirectoryUrlSync` made for the URL reconciliation. Styling, behavior, and markup for a shared control
surface now all live in one place each, rather than one, one, and two.

## Analytics Records the Page, Not the Reader

Civic Ledger carries Vercel Web Analytics and Speed Insights, mounted once in the root layout. Both were chosen on the
same property: they are cookieless and store no cross-site identifier, so adding them does not turn a reader of public
legislative records into a tracked subject. That is a low bar and it is not the interesting part of this decision.

The interesting part is that this app's own best feature would have quietly defeated it. "A Narrowed Directory Is a
Place, So It Has a URL" is why `/members?party=republican&state=Ohio` and `/bills?q=broadband` exist at all, and it is
a genuinely good feature — but an unfiltered analytics feed of those URLs is a log of what each reader searched for and
whose delegation they went looking at. This project's stated position is that no political-affiliation targeting or
persuasion logic belongs in the product; a measurement layer that assembles the raw material for exactly that, as a
side effect of a feature rather than by anyone's decision, would make that position decorative.

So `stripQuery` in `src/components/site-analytics.tsx` cuts everything from the first `?` or `#` before either
collector reports anything. What survives is the page — `/bills`, `/members`, `/committees/house/hsag00` — which
answers "which parts of this are worth keeping" without answering "who is reading it". It is enforced in a `beforeSend`
callback rather than in a dashboard setting, because a dashboard setting is a thing someone can flip and a callback is
a thing that shows up in a diff. It has its own test for the same reason: a promise made in prose and kept by one
uncovered line is a promise that survives until the next refactor.

Two mechanical consequences worth naming:

- **The component is a client component, and the gate that decides whether to render it is not.** `beforeSend` is a
  function, and a function cannot cross the server/client boundary as a prop — so the collectors live in a `"use
  client"` module, while the `STATIC_EXPORT` check that omits them entirely lives in the root layout, which is the only
  side that can read a non-`NEXT_PUBLIC_` environment variable.
- **The static GitHub Pages demo never mounts either one.** Both scripts load from `/_vercel/…`, a path only Vercel
  serves, so on GitHub Pages they would resolve to that site's 404 page on every route. Skipping them there is not a
  privacy concession; it is the same "a static export has no server behind it" fact that already removes the `/api`
  routes.

  Worth stating precisely, because the gate is weaker than it looks: `STATIC_EXPORT` is not `NEXT_PUBLIC_`-prefixed, so
  the bundler cannot fold the check away — the condition is evaluated when the layout renders, not when the bundle is
  built. Nothing is mounted, no script tag is emitted, and no request to `/_vercel/…` is ever made, which is the part
  that matters. What does still happen is that roughly 7 KB of never-executed collector code rides along in the shared
  client chunk of the demo build. Removing it would mean either a second `NEXT_PUBLIC_` flag mirroring the first or a
  bundler alias in `next.config.ts`, both of which split one gate across two places to save a couple of kilobytes on
  the deployment target that is explicitly a preview. The trade goes the other way, and this paragraph is the record of
  it rather than a silence someone else has to rediscover.
