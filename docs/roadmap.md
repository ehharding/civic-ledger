# Roadmap

What is deliberately not built yet, and what has to be true before it is. Order matters: each item below assumes the one
above it.

## 1. Normalized Ingestion — Built

An ingestion table plus scheduled refreshes, covering the three subjects this app already shows and no more. The
warning this item carried — **do not attempt to mirror all of Congress.gov** — is enforced rather than remembered: bills
are windowed on `updateDate` and capped per run, members and committees are bounded lists re-read whole, and a
collection this app has no page for has nothing to gain by being stored. See
[Normalized Ingestion](architecture.md#normalized-ingestion) for the shape and
[The Stored Copy Is a Copy](data-policy.md#the-stored-copy-is-a-copy) for what the copy is allowed to claim.

Three things wanted this. Two of them are now done and the third is closer:

- **Sitemap coverage for individual records** — done. The objection was never that those pages don't deserve listing; it
  was that enumerating them needed an API key and a healthy upstream at build time. A local read needs neither, so the
  exclusion lapsed with the condition that produced it ([Crawlability](architecture.md#crawlability)).
- **A fourth dataset without a fourth round trip** — available, and deliberately unused. No fourth home-page dataset
  exists yet, and inventing one to justify the machinery would be the wrong order. The note in
  [Working With the Upstream API](data-policy.md#working-with-the-upstream-api) is still the place to start when one
  does.
- **Anything resembling notification** — see item 5, which now has a `record_events` log accruing beneath it.

It also produced something this list did not ask for: a **stored fallback**. When Congress.gov is unreachable, a page
now shows real records this app read earlier, labeled as stored, instead of labeled fiction. That is the difference
between "reliable freshness" as a phrase and as a behavior, and it is the reason `DataSource` has three values.

**What is still open here.** The copy covers the current Congress only — `/bills/118` and older still read live or fall
back to preview data, because a backfill is a different job from a refresh and wants its own bounds. Events accrue but
nothing renders them. And `sync_runs` is reported by `/api/health` rather than alerted on; a failed run is visible to
anyone who looks, which is not the same as anyone being told.

## 2. Sign-In and Saved Bills

`saved_bills` is already sketched in `src/db/schema.ts`, and the database it needs is now provisioned rather than
hypothetical — which removes the infrastructure question from this item and leaves the actual one: it is the first
genuinely user-owned surface in the product, which is why it is the first thing that needs auth.

The schema's scope note is worth keeping honest as it grows, and it now has to draw a line it did not before. Two kinds
of data live in that file: what Congress.gov has no opinion about (which person saved which bill) and this app's copy of
what Congress.gov publishes. The second is not the source of truth for anything, and a saved bill must keep pointing at
the record rather than at the copy.

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

Ingestion changes nothing here, and it is worth saying so explicitly: a copy of records that do not contain a roster
still does not contain a roster. Storage makes inference cheaper, not more honest.

## 5. Notifications

Only after freshness, provenance, and opt-in controls are solid. A notification is a claim made without the reader
present to check it, which raises the bar on everything above it rather than adding to it.

Item 1 supplied the first of those three. `record_events` accrues the actions this app has observed, which is the raw
material — but note what it is not: a complete legislative history. It records what changed *while this app was
watching*, and a notification built on it can honestly say "this bill moved" and cannot honestly say "here is everything
that has happened to it". See
[Observed Events Are Not a Legislative History](data-policy.md#observed-events-are-not-a-legislative-history).

The other two are untouched. Opt-in controls need item 2, and provenance for a message sent hours after the fact is a
harder problem than provenance for a page someone is looking at.

## Deferred Tooling

- **Storybook** — add it when the component inventory starts to justify it, not before. See
  [Tooling Stays Small](../CONTRIBUTING.md#tooling-stays-small).
- **A DOM-based HTML sanitizer** — the hand-written one is correct for the narrow, well-understood input CRS summaries
  provide. If this app ever renders markup from a less predictable source, that reasoning expires.
- **A seventh header destination** — five fit on one row, six would fit the current layout, a seventh wants a different
  pattern. The comment on `NAV_LINKS` is the marker for whoever gets there.
- **A durable queue or workflow provider for the sync** — one cron-triggered request that runs three datasets in
  sequence is not a workflow. Revisit when a run needs to survive a restart, fan out, or retry independently per
  dataset.
