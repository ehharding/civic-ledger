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

### The Official-Record Link Is Published Where It Can Be, Derived Where It Can't

Congress.gov's `url` field on a bill record is a *self-referential API* link
(`https://api.congress.gov/v3/bill/119/hr/284?format=json`), not the public page a reader wants. Passing it through
meant the bill page's "Open the Official Record" link — the single most important link in an app whose whole premise is
provenance — served raw JSON, or a 403 to anyone without a key of their own. It is the one field on a bill this app
deliberately never reads.

Two other things can supply that link, and `mapCongressBill` prefers them in this order:

1. **`legislationUrl`, where the record publishes it.** The item-level bill endpoint has carried the public
   congress.gov page since August 2025 — `https://www.congress.gov/bill/119th-congress/house-bill/1` verbatim — and a
   published URL beats a derived one on the same rule that governs `laws`, `committeeWebsiteUrl`, and everything else
   in this document: a fact the publisher states outright cannot be wrong in the way a construction of ours can.
2. **`congressGovBillUrl` (`src/lib/congress/bills/model.ts`) otherwise.** The derivation still earns its place, because
   the *list* endpoint sends no `legislationUrl` at all and a directory card needs the link as much as a detail page
   does. It builds the same string from the bill's own identity, which `mapCongressBill` already requires before it will
   map a record at all. An unrecognized bill type falls back to the Congress.gov home page rather than emitting a
   confidently wrong deep link.

The two coexisting is the point rather than a transitional state: neither covers both endpoints, and dropping the
derivation to use only the published field would leave every card in the bill directory without an outbound link.

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
- **No placeholder has a face.** The member directory shows portraits, which makes this the sharpest form of the rule
  above: a fabricated deep link is the easiest way for preview content to be mistaken for the record, and a photograph
  is easier still. Nothing about a placeholder is real enough to illustrate, so `depiction` is absent from every fixture
  and `member-directory.test.ts` asserts it rather than leaving it to whoever edits the fixtures next.
- **Preview cosponsors reuse the placeholder members and widen the fiction by nobody.** The no-key build serves fixture
  cosponsors so the static demo — the only build a UI reviewer can see — shows that section working rather than showing
  its empty state. Every name in `previewCosponsors` is one of the seven placeholder people the fixtures already name as
  sponsors: each already has a preview page, and each carries a `PREVIEW-n` id that deliberately fails `isBioguideId`.
  `bill-cosponsors.test.ts` asserts that membership rather than leaving it to whoever edits the fixtures next.
- **A preview record never credits Congress.gov with a count.** This is sharper for cosponsors than for any other
  collection, because a fixture bill genuinely *does* carry a cosponsor tally — the fixtures set one so the bill hero's
  meta row has a number to show. Passing it into the section's count sentence would print "Congress.gov records 12
  cosponsors on this bill" above three invented names, which is the same error the summary caption exists to prevent. So
  the section drops both published figures outright when the source is preview and states only what the page is showing.
  Every other collection reaches the same place by a duller route: fixtures set no `collectionCounts` at all.

- **An empty section says which kind of empty it is, and `EmptySectionNote` is where that is decided.** Ten sections
  across the bill, member, and committee pages can come back with nothing to list, and the sentence each prints is not a
  wording choice. On preview data it says the section is waiting for live records; on live data it says why the absence
  is ordinary — most bills have no companion measure, most questions are settled by voice vote, a resolution taken up on
  the floor never acquires a referral. Getting that backwards is the same error as above in a quieter register: "the
  Congressional Research Service hasn't published a summary" printed over a fixture credits a real institution with the
  emptiness of invented content. One component holds the branch for all ten, so the rule has a single enforcement point
  rather than ten chances to be spelled differently, and `src/components/ui/empty-section-note.test.tsx` pins both
  sides.

## What the Chamber Diagram Claims

The home page's seating chart draws one dot per seated member, grouped into contiguous party blocks across a half-disc.
That arrangement is the convention nearly every published chamber diagram uses, and it is **not** where anyone actually
sits: Congress.gov publishes no desk assignments, and neither chamber seats its members in a tidy party-ordered arc. The
chart carries that caveat in its own caption rather than leaving a reader to assume otherwise.

- Members come from `/v3/member/congress/{congress}`. For the Congress currently seated the request carries
  `currentMember=true`, which makes it "who holds a seat right now" rather than "everyone who served at any point in
  this Congress" — without it, a member who resigned mid-term and their replacement both come back and the chamber
  over-counts. For any *earlier* Congress the flag is `false`, which is Congress.gov's own recommendation and the only
  honest reading: a Congress that has risen has a closed roster, and the members who have since left office are part of
  it rather than absent from it. The 117th answers `currentMember=true` with 377 members against a true 557.
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

**An enacted law is read, never inferred.** The detail endpoint publishes `laws` on a bill that became one —
`{ "type": "Public Law", "number": "119-21" }` — and that field settles two things nothing else could. It establishes
the *Became Law* stage outright, rather than by a classifier recognizing a phrase or a code; and it carries the public
law citation, which no classifier could have produced at all, since it appears nowhere else on the record this app
reads. The citation is printed beside the stage cue, as text rather than as a link, on the same rule that governs
committee reports below: congress.gov's URL for a public law is not published by the API and would have to be guessed.

**A collection's size is read, and the sentence says whose figure it is.** The detail record describes each of the four
collections the bill page fetches separately — actions, committees, summaries, text versions — as `{ count, url }`, and
the count is Congress.gov's own answer to how many there are. A sentence beginning "Congress.gov records…" is only true
of that figure, never of the rows this app happened to fetch and map. The two agree on nearly every bill, which is
exactly why the distinction is worth keeping: a statement that is usually true is the kind that goes wrong without
anyone noticing.

They can diverge in two ways. A row this app declines is one it cannot render honestly — an action with no text is not
a row — and a collection longer than the single 250-record page this app requests is cut off at that page. Where the
two figures differ, `describeBillCollection` names both ("Congress.gov records 59 actions on this bill; this page shows
58") rather than presenting the shorter list as the whole of what the record holds. Where Congress.gov published no
count at all — every bill from the *list* endpoint, every preview fixture, every failed read — the sentence claims only
what the page is showing and credits nobody.

**Recorded votes are the one collection with no count to read**, and their sentence is worded accordingly. The figure
there is this app's in a stronger sense than a fetched array's length: `collectRecordedVotes` collapses a roll call that
the chamber's floor log and the Library of Congress each attached to their own action, so the upstream record genuinely
holds more references than the page reports. It says "this bill's actions reference N distinct recorded votes", which
claims the deduplication instead of attributing it to Congress.gov.

**The stage cue is educational, not legal.** It can orient a person; it cannot safely replace a legal-status reading,
and the interface says so and keeps the official link prominent.

Where it gets its answer differs by surface, and the difference is a correctness one rather than a cosmetic one. A
directory card has only the bill's latest action, so `inferBillStage` reads that one line of prose. The bill's own page
has fetched the full action history, so `inferStageFromActions` reads the Library of Congress's own action codes
instead — and those disagree with the prose more often than they sound like they would. A House bill that passed the
House and was then referred to a Senate committee reports "Received in the Senate and Read twice and referred to the
Committee on …" as its latest action, which the prose classifier reads, correctly for the sentence and wrongly for the
bill, as *In Committee*. The code for the passage is still in the history. So a card and the bill's page can show
different stages for the same bill, and where they differ the page is the one that read more of the record.

The code list is deliberately four entries long — passed House, passed Senate, presented, enacted. No attempt is made
to classify the several hundred other codes the endpoint uses, and floor activity is specifically *not* treated as
passage: a bill can accumulate dozens of debate and motion rows without passing anything.

**These three readings settle in one direction only: the most advanced wins.** `resolveBillStage` takes the further of
what the record established and what the codes establish, rather than letting the later read overwrite the earlier one.
That is not a tiebreak dressed up as a rule — it is what keeps the page from contradicting itself. A bill whose `laws`
field names a public law and whose fetched action codes only reach *Passed a Chamber* would otherwise print "Public Law
119-21" beside a stepper that stopped one rung short. Nothing regresses under it, because neither classifier can be the
*lower* reading by being wrong: the prose one only ever names a stage it recognizes, and the code one never returns
anything below *Passed a Chamber*.

**A bill names its committees, from the committee record rather than from the referral sentence.** The page lists every
committee that held the bill, each linking inward to that committee's own page here, with the relationship Congress.gov
recorded printed verbatim — "Referred To", "Reported By", "Markup By". The same fact was already visible in the latest
action and the action history, as prose; what the `/committees` sub-resource adds is the system code, which is the
difference between naming a committee and being able to open it. A referral is a referral and not an outcome, exactly
as on the committee's own page: most bills referred to a committee never leave it.

**A bill names its cosponsors, and cosponsorship is never scored.** The page lists everyone currently signed on, each
linking inward to their own page here, so the relationship a member's page states in one direction — the bills they
cosponsored — is navigable in both. Three rules govern the section:

- **The order is the publisher's, and it is chronological.** Congress.gov returns cosponsors oldest first — the members
  on the bill at introduction, then everyone who joined afterwards, in sequence. That order is the bill gathering
  support over time, so nothing re-sorts it into an alphabetical list that would throw the sequence away.
- **"Original cosponsor" is read, not inferred.** The record publishes the flag on each row. Deriving it by comparing a
  sponsorship date against the bill's introduction date would be this app inventing a comparison, and would be wrong for
  any bill whose record carries one date and not the other.
- **A withdrawal is stated rather than left as a gap.** The record publishes two figures — how many are signed on now,
  and how many have been including anyone who withdrew. The `/cosponsors` collection lists only the first group, so
  where the two disagree the page says how many names are counted upstream but absent from the list below. The
  subtraction is this app's and the sentence says so; both operands are Congress.gov's.

What the section refuses is the obvious next step: cosponsor counts are not ranked, compared, aggregated into a score,
or presented as a measure of a bill's odds or a member's effectiveness. The copy says outright that cosponsoring is not
a vote, not a prediction, and not a ranking. That is the same stance the member page takes on sponsorship, applied from
the other end.

**A bill's related measures are listed with whoever identified the relationship.** Congress.gov's `/relatedbills`
sub-resource answers the question a reader most often arrives at a House bill with — is there a Senate version? — and
each measure links inward to its own page here. Relating two bills is an editorial judgment rather than a legislative
act, and the record names the body that made it (`identifiedBy`: the Congressional Research Service, the House, or the
Senate), so the page prints the attribution beside the relationship instead of presenting relatedness as a property the
measures simply have. A relationship arriving without an attribution is printed without one rather than assigned a
plausible source. The list is in Congress.gov's own order, which the API documents no meaning for, and the copy says so
rather than implying either end is the most significant — the same wording rule the committee-records pages follow.

**A long collection is capped visibly, never silently.** A bill can carry four hundred cosponsors or three dozen related
measures, and either would bury every section beneath it. Both lists show a preview and put the remainder behind a
`<details>` whose label states how many are behind it ("Show the Remaining 28 Cosponsors"). Nothing is dropped, and the
count in the label is what keeps the cap honest: a list that silently stopped at twelve would read as a complete list of
twelve. The published-count sentence above it makes the same guarantee against the upstream record.

**Recorded votes are named, never tallied.** A bill's page lists each roll call taken on it — chamber, roll number,
date — and links the chamber's own record. It prints no counts, no margins, and no member positions, because
Congress.gov's bill record does not carry them and the chambers publish them themselves. The votes reach this app
through the bill's own actions, which is also the only route the Senate's have: Congress.gov publishes a `/house-vote`
resource and no Senate counterpart. Reading them through actions is what keeps both chambers on the same footing here
rather than giving the House a richer page because its data happened to be easier to get.

**A vote reference is dropped unless it can be both named and reached.** A row missing its chamber, roll number,
congress, or URL is not rendered, because a roll call a reader cannot open is worse than one not listed. The same roll
call attached to several actions — which is ordinary, since the chamber's floor log and the Library of Congress both
record it — is listed once, since two rows would read as two votes on the same question.

## What Search Actually Covers

Congress.gov's `/v3/bill` endpoint can only be filtered by congress and bill type — it has **no full-text or keyword
query parameter at all**. So `getSearchResults` approximates a broad search the only way the API allows: it fetches each
supported Congress's most recently active bills (`sort=updateDate+desc`, up to the API's 250-per-request ceiling) and
matches the query against title, type, number, policy area, and latest action text — the same fields already shown on
the card and the detail page (`matchesQuery` in `src/lib/congress/bills/search.ts`).

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

**Each card carries the member's official portrait, and the credit line that has to travel with it.** The list endpoint
publishes `depiction` — this is the one field where a list record is not the poorer of the two, since almost everything
else the member page shows is item-level only — so a roster of faces costs no extra upstream requests at all, just one
string per row (~64 KB of JSON for the full 119th Congress, ~4 KB compressed). The credit is rendered on every card
rather than dropped for space or hidden from sighted readers, because showing the image is conditional on showing it:
the API's terms require the attribution wherever the portrait appears. A small number of records publish an image with
no credit; those keep the image, since discarding a real portrait over a field the publisher left empty would be losing
something the API did supply.

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

Rewriting the name for *display* would be wrong: "Committee" is part of the proper name of some bodies rather than a
suffix on a subject, so the rewrite turns the Joint Economic Committee into "Committee on Joint Economic". Nothing in
the string distinguishes the two cases, and a project whose claim is that you can check it against the record should not
be inventing names for the bodies in it. So the app displays whatever Congress.gov published, and `committeeSearchTerms`
confines the rewrite to matching, where a variant that reads oddly costs nothing because nobody sees one. The visible
consequence: a directory card and a committee's own page can show the same committee under different word orders,
because the two endpoints publish it differently. Both are verbatim, which is the property that matters.

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

**What the page does link is the committee's own site**, because the API states that URL
outright — `committeeWebsiteUrl` was added to the committee item endpoint in December 2025, and House Agriculture's
record returns `https://agriculture.house.gov/` verbatim. That is the same rule as above rather than an exception to it:
a published URL is linkable and a derived one is not. The link's own copy says the roster lives at that destination and
not on this page, which is a more useful thing to tell a reader than silence about why the membership is missing.

What the page carries instead is the committee's recorded name history — the most genuinely educational thing the API
publishes about one. A committee's jurisdiction is usually rewritten by renaming it ("Committee on Education and Labor"
becoming "Committee on Education and the Workforce" and back again tracks which party held the chamber, not a clerical
tidy-up), and that story is invisible from a current name alone.

### A Committee's Records Are Paged in Congress.gov's Order, Not in Time

The committee page reads three collections a committee accumulates — the bills referred to it, the reports it published,
and the nominations sent to it — and each one is a deep link (`?records=reports&page=3`). Three claims about them are
made carefully, and one is deliberately never made.

**Never made: that any page is the most recent.** These collections are not published in a documented order. Sampling
House Agriculture's 10,205 referrals across their whole range gives update timestamps of 2015, 2021, 2016, 2016, 2016,
2019, 2026 — ascending overall and emphatically not monotonic. The same committee's reports run roughly oldest to
newest, while the Senate Judiciary Committee's nominations run the other way. The endpoint accepts a `sort` parameter
and ignores it. So the page walks the publisher's own sequence and says exactly that in the line above the list, rather
than labeling either end. A list this app cannot order is one it does not claim to have ordered.

**A referral is a referral, not an outcome.** Congress.gov publishes the relationship it recorded — "Referred To",
"Reported By" — verbatim, and the page prints that word rather than paraphrasing it into a status. Most bills referred
to a committee never leave it, and that is the ordinary case rather than a failure of one.

**Where the two counts disagree, the pageable one wins.** Congress.gov reports a collection's size twice and the two do
not always agree: House Agriculture's own record says 17,795 bills while its bills endpoint says 10,205 for the same
collection. The figure printed above a list is the one that list actually has, because it is the one a reader can check
by paging to the end. The committee's own figure stands only for collections that have not been fetched.

**Reports and nominations get no outbound link, for the same reason committees don't.** Their congress.gov URLs look
derivable from the record — `/congressional-report/{ordinal}-congress/{chamber}-report/{number}` — and cannot be
verified from here, because congress.gov answers automated requests with a bot challenge. Each row prints the citation
Congress.gov identifies the record by and stops there. Referred *bills* do link, but inward, to this app's own page for
the measure, which carries the verified outbound link onward.

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

A third rule follows from the rest of this document: **a lesson never misstates what this app shows, in either
direction.** The voting module is the sharp case. A lesson that under-claims is as wrong as one that over-claims — a
reader told the app holds nothing would not go looking for what it does hold — so the module draws the actual line: the
votes are named and linked here, the arithmetic is at the chambers.

The glossary (`src/lib/glossary.ts`) is deliberately exempt. The line is length rather than rigor: a one-line definition
of "cosponsor" is vocabulary, and a five-step account of how a chamber records a vote is a claim. What the glossary owes
instead is coverage of the terms the lessons lean on.

### A Definition Is Attached to the Record, Never Merged Into It

Glossary terms are annotated wherever they appear in the app's prose — including in a bill's latest action, which is a
sentence Congress wrote rather than one this project did. That is the point (it is where a reader most often meets a
word they don't have) and it is also the one place this feature could quietly break the rule the rest of this document
is about, so the boundary is explicit:

- **The record's own text is never altered.** `annotateGlossaryTerms` only splits a string into runs; concatenating them
  back reproduces the input exactly, and `glossary.test.ts` pins that as an invariant rather than as an intention. No
  word is corrected, expanded, or replaced with the glossary's spelling — "committees" stays "committees".
- **The definition stays visibly Civic Ledger's.** It appears in its own panel, headed by the glossary's term, next to
  the sentence rather than inside it. A reader is never shown this project's wording as though Congress had published
  it, which is the same rule the preview fixtures and the CRS summary captions already hold.
- **Every annotated term links to its full entry** on `/learn`, so the definition a reader was shown in passing is one
  they can go read in full, in the place that says who wrote it.

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

So `redactUrl` (`src/lib/observability/redact.ts`) cuts everything from the first `?` or `#` before either collector
reports anything. What survives is the page — `/bills`, `/members`, `/committees/house/hsag00` — which answers
"which parts of this are worth keeping" without answering "who is reading it." It is enforced in a `beforeSend` callback
rather than a dashboard setting, because a dashboard setting is a thing someone can flip and a callback is a thing that
shows up in a diff. It has its own test for the same reason: a promise made in prose and kept by one uncovered line is a
promise that survives until the next refactor.

The static GitHub Pages demo ships neither collector — see
[Deployment](deployment.md#secondary-github-pages-static-demo).

### An Error Report Names a Page, Never a Query

Sentry reports crashes and upstream failures, and it is held to the rule above rather than exempted from it. Left on its
defaults it would break that rule outright, which is why this section exists.

Sentry's own documentation is explicit: with `sendDefaultPii` off and every other default in place, "the full request
URL of outgoing and incoming HTTP requests is always sent," query string included. In this app that sentence describes
two separate leaks that happen to have one fix:

- **The Congress.gov key travels in the query string.** `buildCongressUrl` appends `api_key=…` to every outbound URL, so
  an unfiltered breadcrumb or span is a published credential. The rule at the top of this document — that the key never
  reaches a browser — would be kept on the page and broken on the wire.
- **The reader's query string is the search log.** `/bills?q=broadband` and `/members?party=republican&state=Ohio` would
  arrive on every crash report: the same dataset the section above refuses, collected through a different door by a tool
  nobody thinks of as a measurement layer.

So both layers make the same cut through the same function. `redactUrl` lives in `src/lib/observability/redact.ts`
rather than beside either caller, because a promise kept by two copies of a function is a promise that survives until
someone edits one of them.

What the error tracker is allowed to collect is set in `src/lib/observability/sentry-options.ts`, in code rather than in
a Sentry project setting: query params, request and response headers, cookies, request bodies, user info, and captured
local variables are all refused outright. The redaction callbacks then run over every event as a backstop, so a field a
future SDK version adds is covered before anyone here has heard of it. Local variables get both treatments because the
key can reach a stack frame with no `api_key=` prefix for a pattern to find — so the redactor also strips the key's
literal value, which is the pass that makes this airtight rather than merely careful.

**No Session Replay.** It is the SDK's headline feature and the wrong feature for this product: it records the DOM, and
the DOM here is the congressional record a reader was reading plus whatever they typed into a search box. Adding it
would rebuild, in higher fidelity, precisely the dataset this section refuses. Turning it on needs an argument in this
document, not a line in a config file.

As with the analytics cut, all of this has its own tests (`redact.test.ts`, `sentry-options.test.ts`) — and for the same
reason. The static GitHub Pages demo carries no error tracker at all; the SDK is replaced with a no-op at build time.

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
