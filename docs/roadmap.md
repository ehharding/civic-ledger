# Roadmap

What is deliberately not built yet, and what has to be true before it is. Order matters: each item below assumes the one
above it.

## 1. Normalized Ingestion

Add an ingestion table plus scheduled `updatedSince` refreshes. **Do not attempt to mirror all of Congress.gov on day
one** — the point is reliable history and freshness for the records this app already shows, not a second copy of the
register. See [Persistence Plan](architecture.md#persistence-plan) for the table shapes this is waiting on.

This is first in the list because three other things want it: sitemap coverage for individual records
([Crawlability](architecture.md#crawlability)), a home page that needs a fourth dataset without a fourth round trip, and
anything resembling notification.

## 2. Sign-In and Saved Bills

`saved_bills` is already sketched in `src/db/schema.ts`. It is the first genuinely user-owned surface in the product,
which is why it is the first thing that needs auth — and why the schema's scope note is worth keeping honest as it
grows: congressional records are not stored there and are not mirrored.

## 3. A Fourth Learning Module

The three this item originally asked for are built — the bill lifecycle, what a committee does, and how Congress votes —
and they share one registry (`src/lib/lessons.ts`) and one route (`/learn/[slug]`), so a fourth is an edit to that file
rather than a new page. The condition attached here was met rather than dropped: a lesson cites its sources, and every
module also prints what it leaves out. See
[Editorial Content Cites Its Sources](data-policy.md#editorial-content-cites-its-sources) for the standing rule and its
enforcement point.

**What a fourth module needs first, and none of the three did: a retrieval date.** Every citation today is a stable
explanatory page on house.gov, senate.gov, clerk.house.gov, or the National Archives — documents whose content is not
versioned by when you read them. A module citing a CRS report, a specific Congress's rules, or anything else that is
revised in place needs the date it was read printed beside the link, and `LessonSource` carries no such field. Add it
with the first citation that requires it, not before.

The glossary stays uncited by design. The line is length, not rigor: a one-line definition is vocabulary anyone can
confirm in a sentence, and a five-step explanation is a claim.

## 4. Committee Membership — Blocked

The committee directory and committee pages exist, but Congress.gov publishes no roster, and this project will not infer
one. **This unblocks only when a citable source exists** — not when a plausible inference becomes available. See
[The Committee Page Has No Roster](data-policy.md#the-committee-page-has-no-roster-and-no-deep-link) for why.

Rechecked against the API's current committee endpoints in August 2026: still no membership resource. The *deep link*
half of that section did unblock, separately — the item endpoint now publishes `committeeWebsiteUrl` — and the committee
page links it. The roster is a different problem and remains this one.

## 4a. Senate Roll-Call Votes — Partly Blocked

A bill's page names every recorded vote taken on it, for both chambers, read from its action history. What is not
reachable is anything past the reference: Congress.gov publishes `/house-vote` (list, item, and per-member levels, 117th
Congress onward) and **no Senate counterpart** — `/senate-vote` 404s.

That asymmetry is the reason nothing beyond the reference is built yet. The House endpoint would support party totals
and a member-by-member breakdown tomorrow; doing that while the Senate had only a link would make the House look like
the chamber that votes, which is a worse distortion than showing less of both. **Revisit if a Senate vote endpoint
appears** — or build the House breakdown behind copy that names the gap in the interface itself, not only here.

One implementation note for whoever gets there: the member-level path is
`/house-vote/{congress}/{session}/{roll}/members`, not the `/votes` the API's own documentation gives, and that endpoint
spells the member key `bioguideID` — capital D — unlike every other endpoint in the API.

## 5. Notifications

Only after freshness, provenance, and opt-in controls are solid. A notification is a claim made without the reader
present to check it, which raises the bar on everything above it rather than adding to it.

## Deferred Tooling

- **Storybook** — add it when the component inventory starts to justify it, not before. See
  [Tooling Stays Small](../CONTRIBUTING.md#tooling-stays-small).
- **A DOM-based HTML sanitizer** — the hand-written one is correct for the narrow, well-understood input CRS summaries
  provide. If this app ever renders markup from a less predictable source, that reasoning expires.
- **A seventh header destination** — five fit on one row, six would fit the current layout, a seventh wants a different
  pattern. The comment on `NAV_LINKS` is the marker for whoever gets there.
