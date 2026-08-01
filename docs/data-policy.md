# Data Policy

This is the product's spine: what Civic Ledger claims about congressional records, and — more importantly — what it
deliberately refuses to claim. Everything here is a rule the code is written to keep, not an aspiration. If a change
would break one of these, it needs a better argument than convenience.

The short version: **Congress.gov is the source of truth, this app is a reading surface over it, and anything this app
computed rather than received says so.**

## The Source of Truth Stays Upstream

- Congress.gov is the source of truth for congressional records. This app normalizes and presents them; it does not
  replace, correct, or re-host them.
- Every data-backed surface links a reader to the corresponding official record instead of standing in for it.
- API calls stay on the server. `CONGRESS_API_KEY` must never carry a `NEXT_PUBLIC_` prefix — a Congress.gov key travels
  in the request URL, so a request issued from the browser is a published key.
- The adapter explicitly requests `format=json`, validates the shape it depends on at runtime, maps only known fields
  into a stable internal model, and caches the upstream request for five minutes.
- Source freshness is visible rather than merely computed: every snapshot carries a `retrievedAt` timestamp, and
  `DataSourceNotice` renders it ("Updated 5 minutes ago") on the pages built from it.

### The Official-Record Link Is Derived, Not Passed Through

Congress.gov's `url` field on a bill record is a *self-referential API* link
(`https://api.congress.gov/v3/bill/119/hr/284?format=json`), not the public page a reader wants. Passing it through
meant the bill page's "Open the Official Record" link — the single most important link in an app whose whole premise is
provenance — served raw JSON, or a 403 to anyone without a key of their own.

`congressGovBillUrl` (`src/lib/congress/types.ts`) derives the public URL
(`https://www.congress.gov/bill/119th-congress/house-bill/284`) from the bill's own identity, which `mapCongressBill`
already requires before it will map a record at all. An unrecognized bill type falls back to the Congress.gov home page
rather than emitting a confidently wrong deep link.

## Preview Data Is Labeled Fiction

The app runs with clearly marked preview records until `CONGRESS_API_KEY` is set, and falls back to them whenever an
upstream read fails. Preview content is fictional and is never presented as live congressional data.

- Fixture bills link only to the Congress.gov **home page**, never to a plausible-looking deep link, so they cannot be
  mistaken for official bill pages.
- **The chamber diagram gets placeholders, not a fictional roster.** Every other fixture in this app is a small set of
  labeled fictional records; a seating chart can't work that way, because it needs a full chamber to lay out at all. A
  fabricated roster of 535 plausible names, parties, and districts is far easier to mistake for real data than a labeled
  placeholder is — especially since a seating chart specifically invites a reader to go find their *own* representative.
  So the no-key path fills both chambers with unattributed "Preview Seat N" placeholders, and the party split behind
  them (`previewChamberPartySplits`) is deliberately round rather than realistic. A real-looking party balance would be
  a factual claim about the current Congress that a checked-in fixture has no way to keep true.
- **Placeholder members exist where a placeholder roster still doesn't.** The seven fictional sponsors the preview bills
  already print do get member pages; the 535 placeholder seats do not, and are not links. Giving a page to a name the
  fixtures already name adds no claim they weren't already making. Two structural safeguards keep the fiction
  unmistakable: the IDs (`PREVIEW-1`…) deliberately fail `isBioguideId`, so a placeholder is never sent upstream *and*
  can never produce a link to a real person's biography; and placeholder members carry no official website, since a
  fabricated deep link is the easiest way for preview content to be taken for the record.

## What the Chamber Diagram Claims

The home page's seating chart draws one dot per seated member, grouped into contiguous party blocks across a half-disc.
That arrangement is the convention nearly every published chamber diagram uses, and it is **not** where anyone actually
sits: Congress.gov publishes no desk assignments, and neither chamber seats its members in a tidy party-ordered arc. The
chart carries that caveat in its own caption rather than leaving a reader to assume otherwise.

- Members come from `/v3/member/congress/{congress}` with `currentMember=true`, which makes the request "who holds a
  seat right now" rather than "everyone who served at any point in this Congress." Without it, a member who resigned
  mid-term and their replacement both come back and the chamber over-counts.
- **Vacant seats are absent rather than drawn.** The API reports who holds a seat, not how many seats are authorized.
- **The House's six non-voting seats are counted and labeled separately** — the five Delegates and Puerto Rico's
  Resident Commissioner. A diagram that renders all 441 identically quietly asserts something false about how the
  chamber votes. The list-level record doesn't carry the `memberType` field that would say so directly (that is
  item-level only, meaning one extra request per member), so it is derived from the represented jurisdiction, which
  determines it unambiguously.

## What a Bill Record Shows

**A CRS summary and links, not re-hosted legislative text.** Congress.gov's `/text` sub-resource returns links to
Formatted Text/PDF/XML documents it hosts itself, not text as JSON. Fetching, parsing, and re-hosting those would fight
the source-of-truth stance above, add a large and inconsistently formatted content type to render and store, and
duplicate what Congress.gov already serves well. The bill page instead shows the CRS `/summaries` sub-resource — short,
plain-English, exactly the framing this project wants — and links out to every official text version for anyone who
wants the primary source.

**The stage cue is educational, not legal.** `inferBillStage` reads human-written action text. It can orient a person;
it cannot safely replace a legal-status reading, and the interface says so and keeps the official link prominent.

## What Search Actually Covers

Congress.gov's `/v3/bill` endpoint can only be filtered by congress and bill type — it has **no full-text or keyword
query parameter at all**. So `getSearchResults` approximates a broad search the only way the API allows: it fetches each
supported Congress's most recently active bills (`sort=updateDate+desc`, up to the API's 250-per-request ceiling) and
matches the query against title, type, number, policy area, and latest action text — the same fields already shown on
the card and the detail page (`matchesQuery` in `src/lib/congress/search.ts`).

Two honest limits follow, and the result-count copy states them rather than implying an exhaustive search:

- It cannot see a bill's full legislative text.
- For a large or old Congress it sees only that Congress's most recently touched slice, not every bill introduced in it.

A query that parses as a bill citation (`parseBillCitation` — "HR 284", "H.J.Res. 66", "119 HR 284") also gets a direct
single-bill lookup, pinned first. That is the one case where the API can answer exactly rather than by approximation.

**Congress-scoped browsing is bounded to what the API covers.** `/bills/[congress]` reaches back to the 93rd Congress
(1973) and no further, matching where Congress.gov's own bill and resolution records begin (see
["About Legislation of the U.S. Congress"](https://www.congress.gov/help/legislation)). Earlier Congresses have only
partial, largely non-digitized material the list endpoint doesn't cover. Every Congress the picker offers therefore
resolves to a page that can show real records once a key is configured. The boundary lives in one place —
`EARLIEST_COVERED_CONGRESS` in `src/lib/congress/congress-history.ts` — so it can move if coverage changes.

## What Each Directory Covers

**Members (`/members`)** lists whoever currently holds a seat, from the same `currentMember=true` request the chamber
diagram uses — so it is a roster of *now*, not of everyone who served during a Congress, and vacant seats are absent
rather than listed. A member whose upstream record carries no Bioguide ID is dropped rather than shown as a card that
opens nothing. Without a key it lists the same seven placeholder people the preview bills name, and says so instead of
claiming they hold seats — some are marked as former members.

**Committees (`/committees`)** lists parent committees and folds subcommittees into them. Congress.gov's
`/v3/committee/{congress}` endpoint returns subcommittees as *peers* of their parents: House Agriculture and its six
subcommittees arrive as seven records in one flat array, distinguishable only by a `parent` field. Rendered as it
arrives, that offers a reader a choice between "Livestock and Foreign Agriculture Subcommittee" and the Judiciary
Committee as though they were comparable bodies. They are not — a subcommittee only means anything in relation to its
parent. Nothing becomes unreachable: every parent's page lists its subcommittees, each with a page of its own, and every
card carries the count, so the directory states how much sits one level down rather than silently flattening it away.

This is also why `"Subcommittee"`, a documented value of the API's own `committeeTypeCode`, is not one of this app's
`committeeTypes`. Being a subcommittee is a fact about a record's relationship to another record, and this app models it
structurally; a type restating it would be a second answer to the same question, free to disagree with the first.

### Committee Names Are Verbatim, and Rewritten Only for Search

The same committee is published under two word orders depending on where you meet it. The list endpoint says
`"Agriculture Committee"`. A bill's referral line, the chambers' own sites, and the committee's item-level
`officialName` all say `"Committee on Agriculture"`. A reader who copies a referral line off a bill page into the
committee search box is searching for a string that appears nowhere in the list data.

Rewriting the name for *display* is wrong, and a component test caught it: "Committee" is part of the proper name of
some bodies rather than a suffix on a subject, so the rewrite turned the Joint Economic Committee into "Committee on
Joint Economic". Nothing in the string distinguishes the two cases, and a project whose claim is that you can check it
against the record should not be inventing names for the bodies in it. So the app displays whatever Congress.gov
published, and `committeeSearchTerms` confines the rewrite to matching, where a variant that reads oddly costs nothing
because nobody sees one. The visible consequence: a directory card and a committee's own page can show the same
committee under different word orders, because the two endpoints publish it differently. Both are verbatim, which is the
property that matters.

### The Committee Page Has No Roster, and No Deep Link

Two things a reader might reasonably expect are deliberately absent.

**No membership.** Congress.gov's committee endpoints publish no roster. Assembling one by inference — from members' own
records, from bill referrals, from anywhere — would be the most plausible-looking fabrication this app could ship,
because a list of names under a committee heading reads as a fact whatever caveat sits beside it. The page says what the
API says and stops.

**No per-committee link to congress.gov.** Their URLs take the form `/committee/house-agriculture/hsag00`: a name slug,
then the system code. The slug is not published by the API, and deriving it from the name is guesswork that diverges
further the longer the name gets. A guessed slug that happens to be wrong produces a link that looks authoritative and
lands on a 404, which is worse here than one extra click. The page links Congress.gov's committee index and prints the
system code beside it, which is what actually identifies the committee at the destination.

What the page carries instead is the committee's recorded name history — the most genuinely educational thing the API
publishes about one. A committee's jurisdiction is usually rewritten by renaming it ("Committee on Education and Labor"
becoming "Committee on Education and the Workforce" and back again tracks which party held the chamber, not a clerical
tidy-up), and that story is invisible from a current name alone.

## Editorial Content Cites Its Sources

The `/learn` modules are the one place this app writes prose about how Congress works rather than presenting a record it
received. That makes them the one place it can be wrong in its own voice, so they carry two obligations no other surface
does, both rendered on the page rather than kept in a doc:

- **Every module ends with its sources**, each naming its publisher (`LessonSources`). The rule is primary sources
  only — house.gov, senate.gov, clerk.house.gov, congress.gov, and the National Archives' transcription of the
  Constitution — over https, no secondary explainers, nothing paywalled. A citation a reader cannot open is decoration.
  Enforced in `src/lib/lessons.test.ts`, which checks the host, the scheme, the publisher, and that no lesson cites the
  same document twice.
- **Every module states what it leaves out**, in its own `limits` list. Each of these lessons is a simplification — that
  is what a lesson is — and a simplification that doesn't say so is just an inaccuracy. The panel sits between the last
  step and the sources, so a reader who skims still passes it.

A third rule follows from the rest of this document: **a lesson never implies this app shows something it doesn't.** The
voting module is the sharp case. Civic Ledger holds no roll-call data at all, so the lesson says so in the same breath
as it explains what a recorded vote is, and sends the reader to the two chambers' own tallies. Explaining a thing the
interface cannot show is useful; explaining it in a way that leaves a reader hunting the interface for it is not.

The glossary (`src/lib/glossary.ts`) is deliberately exempt. The line is length rather than rigor: a one-line definition
of "cosponsor" is vocabulary, and a five-step account of how a chamber records a vote is a claim. What the glossary owes
instead is coverage of the terms the lessons lean on.

## What This Product Will Not Do

**No scoring.** Member pages report what Congress.gov publishes — service record, party, jurisdiction, and the
legislation a member put their name to. There are no vote ratings, effectiveness scores, or ideological placements.
Those are editorial judgments, and this project's position is that clarity and provenance, not persuasion, are the
product. The member page says so in its own closing card rather than leaving the omission to be inferred.

**No political-affiliation targeting or persuasion logic**, in the product or in the measurement layer.

### Analytics Records the Page, Not the Reader

Vercel Web Analytics and Speed Insights are mounted once in the root layout. Both were chosen on the same property: they
are cookieless and store no cross-site identifier, so adding them does not turn a reader of public legislative records
into a tracked subject. That is a low bar, and it is not the interesting part.

The interesting part is that this app's own best feature would have quietly defeated it. Shareable narrowed directories
are why `/members?party=republican&state=Ohio` and `/bills?q=broadband` exist at all — and an unfiltered analytics feed
of those URLs is a log of what each reader searched for and whose delegation they went looking at. A stance against
affiliation targeting would be decorative if the measurement layer assembled the raw material for it as a side effect of
a feature rather than by anyone's decision.

So `stripQuery` in `src/components/site-analytics.tsx` cuts everything from the first `?` or `#` before either collector
reports anything. What survives is the page — `/bills`, `/members`, `/committees/house/hsag00` — which answers "which
parts of this are worth keeping" without answering "who is reading it." It is enforced in a `beforeSend` callback rather
than a dashboard setting, because a dashboard setting is a thing someone can flip and a callback is a thing that shows
up in a diff. It has its own test for the same reason: a promise made in prose and kept by one uncovered line is a
promise that survives until the next refactor.

The static GitHub Pages demo ships neither collector — see
[Deployment](deployment.md#secondary-github-pages-static-demo).

## Working With the Upstream API

The Congress.gov API uses v3, pagination, and an hourly request quota (5,000/hour). Read the official
[API repository](https://github.com/LibraryOfCongress/api.congress.gov/) before extending ingestion; its
[changelog](https://github.com/LibraryOfCongress/api.congress.gov/blob/main/ChangeLog.md) also explicitly recommends
setting the response format rather than relying on the default.

Two request patterns in this app cost more than an ordinary page load, and both are deliberately kept on the shared
five-minute cache rather than given a policy of their own:

- **The search sweep** issues one request per supported Congress (~27 today). Concurrent and repeated searches inside
  the cache window are served from cache, which is what keeps sweeping every Congress well inside the quota rather than
  something needing its own throttling.
- **The home page** fetches membership alongside the bill snapshot — one page-0 request to read `pagination.count`, then
  the remaining pages in parallel, issued concurrently with the bill fetch rather than after it. If the home page ever
  needs a fourth independent dataset, that is the point to revisit whether these belong in the scheduled-ingestion path
  in [architecture.md](architecture.md#persistence-plan) instead of on-demand reads.
