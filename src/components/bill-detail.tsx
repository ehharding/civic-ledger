import { ArrowUpRight, ChevronLeft, Landmark } from "lucide-react";
import Link from "next/link";
import { Fragment, type JSX } from "react";

import { BillJourney } from "@/components/bill-journey";
import { CalloutCard } from "@/components/callout-card";
import { DataSourceNotice } from "@/components/data-source-notice";
import { DetailPanel } from "@/components/detail-panel";
import { EmptySectionNote, previewPendingCopy } from "@/components/empty-section-note";
import { GlossaryProse } from "@/components/glossary-prose";
import { OutboundLink } from "@/components/outbound-link";
import { SiteShell } from "@/components/site-shell";
import { billHref } from "@/lib/bill-route";
import { committeeHref } from "@/lib/committee-route";
import type { BillCommittee, BillCommitteeActivity, BillSubcommittee } from "@/lib/congress/committees";
import { collectRecordedVotes } from "@/lib/congress/mappers";
import { normalizePartyCode, type PartyGroup, partyTintClass } from "@/lib/congress/members";
import { resolveBillStage } from "@/lib/congress/stage";
import {
  type BillAction,
  type BillCosponsor,
  type BillCosponsorTally,
  type BillStage,
  type BillSummary,
  type BillTextFormat,
  type BillTextVersion,
  billIdentityKey,
  billStageLabels,
  type CongressSnapshot,
  describeBillCollection,
  describeOriginalCosponsors,
  describeWithdrawnCosponsors,
  formatEnactedLaw,
  type LegislativeBill,
  type RecordedVote,
  type RelatedBill,
  type RelatedBillRelationship,
} from "@/lib/congress/types";
import { formatDate, formatOrdinal, pluralize } from "@/lib/format";
import { lessonHref } from "@/lib/lesson-route";
import { memberHref } from "@/lib/member-route";

/** Props for {@link BillDetail} — everything the bill detail route resolves server-side. */
type BillDetailProps = {
  bill: LegislativeBill;
  /** Whether this record is live Congress.gov data or a labeled preview fixture. Changes wording throughout. */
  source: CongressSnapshot["source"];
  /** User-facing explanation of *why* preview data is being shown, when it is. */
  notice?: string;
  /** When this bill's data was actually fetched — passed straight through to `DataSourceNotice`. */
  retrievedAt?: string;
  /** Every CRS summary on file for this bill, most recent first. */
  summaries: BillSummary[];
  /** Every official text version on file for this bill, most recent first. */
  textVersions: BillTextVersion[];
  /** The bill's full action history, most recent first. Empty in preview mode and whenever the fetch failed. */
  actions: BillAction[];
  /** Every committee that held this bill, in Congress.gov's own order. Empty in preview mode and on failure. */
  committees: BillCommittee[];
  /**
   * Everyone currently signed on, in the publisher's chronological order. Empty on failure, and in preview mode holds
   * the labeled fixture cosponsors rather than nothing.
   * @see previewCosponsors
   */
  cosponsors: BillCosponsor[];
  /** Every measure recorded as related to this one, in the publisher's order. Empty in preview mode and on failure. */
  related: RelatedBill[];
};

/**
 * How many cosponsors are shown before the rest move behind a disclosure.
 *
 * A bill can carry four hundred names, and a page that prints all of them puts every section below it — the summary,
 * the full text, the related measures — an unreasonable scroll away. Twelve is enough to see the shape of who signed
 * on, including whether the list crosses party lines, while keeping the rest of the page reachable. Nothing is dropped:
 * the remainder is one click away, in the same `<details>` idiom the action history and the earlier summaries use.
 */
const COSPONSOR_PREVIEW_LIMIT: number = 12;

/**
 * How many related measures are shown before the rest move behind a disclosure.
 *
 * Lower than the cosponsor limit because the rows are taller by a wide margin: a cosponsor is one name, and a related
 * measure carries a title plus its own latest action, which on an appropriations bill runs to five lines by itself.
 * Nine keeps this section roughly the height of the ones above it instead of several times their length.
 */
const RELATED_BILL_PREVIEW_LIMIT: number = 9;

/** Props for {@link DisclosedList}. */
type DisclosedListProps<Item> = {
  /** Everything to show, in the order it should read. */
  items: Item[];
  /** How many appear before the disclosure. */
  limit: number;
  /** The `<ul>`'s class, applied to both the visible list and the disclosed one so they lay out identically. */
  listClassName: string;
  /** Renders one item. */
  renderItem: (item: Item) => JSX.Element;
  /** A stable key for one item. */
  keyFor: (item: Item) => string;
  /** The disclosure's label, given how many are behind it — e.g., `` (n) => `Show the Remaining ${n} Cosponsors` ``. */
  moreLabel: (remaining: number) => string;
};

/**
 * A long list, capped at a preview length with the remainder behind a `<details>`.
 *
 * Two of this page's collections need the same treatment for the same reason — a bill can have four hundred cosponsors
 * or three dozen related measures, and either would bury every section beneath it — so the rule is stated once here
 * rather than implemented twice with two chances to disagree about it.
 *
 * **Nothing is dropped and the label says how much is behind it.** That is the point of the disclosure rather than a
 * detail of it: this app's standing rule is that a bounded view names what it bounded (@see describeBillCollection),
 * and a list that silently stopped at twelve would read as a complete list of twelve. The count in the summary text is
 * what keeps the cap honest, and it is why `moreLabel` receives the number rather than being a fixed string.
 *
 * @typeParam Item - The record type being listed.
 * @param props - @see DisclosedListProps
 * @returns The visible list, followed by the disclosure when anything is behind it.
 */
function DisclosedList<Item>({
  items,
  limit,
  listClassName,
  renderItem,
  keyFor,
  moreLabel,
}: DisclosedListProps<Item>): JSX.Element {
  const shown: Item[] = items.slice(0, limit);
  const remaining: Item[] = items.slice(limit);

  return (
    <>
      <ul className={listClassName}>
        {shown.map(
          (item: Item): JSX.Element => (
            <Fragment key={keyFor(item)}>{renderItem(item)}</Fragment>
          ),
        )}
      </ul>

      {remaining.length > 0 ? (
        <details className="summary-history">
          <summary className="summary-history__toggle">{moreLabel(remaining.length)}</summary>
          <ul className={listClassName}>
            {remaining.map(
              (item: Item): JSX.Element => (
                <Fragment key={keyFor(item)}>{renderItem(item)}</Fragment>
              ),
            )}
          </ul>
        </details>
      ) : null}
    </>
  );
}

/**
 * One cosponsor: who they are, which party they sit with, and when they signed on.
 *
 * Links inward to the member's own page, on the same reasoning as the sponsor line in the hero — that page collects
 * their seat, service record, and everything else they have put their name to, and carries the official biography link
 * onward. A cosponsor arriving without a Bioguide ID renders as plain text rather than as a link to nothing, which is
 * also what every preview fixture does.
 *
 * @param cosponsor - The cosponsor to render.
 * @returns The row.
 */
function CosponsorRow({ cosponsor }: { cosponsor: BillCosponsor }): JSX.Element {
  const party: PartyGroup = normalizePartyCode(cosponsor.party);

  return (
    <li className={`cosponsor-list__item ${partyTintClass(party)}`}>
      <span className="cosponsor-list__name">
        {cosponsor.bioguideId ? (
          <Link className="text-link" href={memberHref(cosponsor.bioguideId)}>
            {cosponsor.fullName}
          </Link>
        ) : (
          cosponsor.fullName
        )}
      </span>
      <span className="cosponsor-list__meta">
        {/* "Original" is the record's own distinction, not a date comparison this app made — @see BillCosponsor. It is
            the one thing on the row that says something a count could not. */}
        {cosponsor.isOriginal ? <span className="cosponsor-list__original">Original</span> : null}
        {cosponsor.sponsorshipDate ? (
          <span className="date-label">
            {cosponsor.isOriginal ? "At introduction" : `Joined ${formatDate(cosponsor.sponsorshipDate)}`}
          </span>
        ) : null}
        {cosponsor.withdrawnDate ? (
          <span className="cosponsor-list__withdrawn">Withdrawn {formatDate(cosponsor.withdrawnDate)}</span>
        ) : null}
      </span>
    </li>
  );
}

/**
 * The members who put their name to a bill, listed rather than merely counted.
 *
 * Congress.gov returns these oldest first — everyone who signed at introduction, then everyone who joined afterwards,
 * in order — and that sequence is kept rather than re-sorted, since it is the bill gathering support over time.
 * @see getBillCosponsors.
 *
 * The one number this section computes rather than reads is how many were original cosponsors, and the sentence
 * attributes it accordingly: it is a tally of a published boolean, not a published figure.
 *
 * **The published figures are dropped entirely on a preview record**, which is the one thing this section must not get
 * wrong. Unlike every other collection on this page, a fixture bill *does* carry a cosponsor tally — the fixtures set
 * it so the hero's meta row has a count to show — so passing it straight through would print "Congress.gov records 12
 * cosponsors on this bill" over three fictional names. Preview copy never credits a real institution with invented
 * content; the same rule spells the summary caption.
 * @see SummaryCaption, and docs/data-policy.md.
 *
 * @param cosponsors - Everyone currently signed on, in the publisher's order.
 * @param tally - Congress.gov's own figures, including anyone who later withdrew.
 * @param source - Whether this record is live or preview data.
 * @returns The count lines and the list, the tail of it behind a disclosure.
 */
function CosponsorList({
  cosponsors,
  tally,
  source,
}: {
  cosponsors: BillCosponsor[];
  tally: BillCosponsorTally | undefined;
  source: CongressSnapshot["source"];
}): JSX.Element {
  const published: BillCosponsorTally | undefined = source === "preview" ? undefined : tally;
  const originals: number = cosponsors.filter((cosponsor: BillCosponsor): boolean => cosponsor.isOriginal).length;
  const withdrawn: string = describeWithdrawnCosponsors(published);

  return (
    <>
      <p className="muted-copy">
        {describeBillCollection({ shown: cosponsors.length, published: published?.current, noun: "cosponsor" })}{" "}
        {describeOriginalCosponsors(originals, cosponsors.length)}
      </p>
      {withdrawn.length > 0 ? <p className="muted-copy">{withdrawn}</p> : null}

      <DisclosedList
        items={cosponsors}
        keyFor={(cosponsor: BillCosponsor): string => cosponsor.bioguideId ?? cosponsor.fullName}
        limit={COSPONSOR_PREVIEW_LIMIT}
        listClassName="cosponsor-list"
        moreLabel={(remaining: number): string => `Show the Remaining ${remaining} Cosponsors`}
        renderItem={(cosponsor: BillCosponsor): JSX.Element => <CosponsorRow cosponsor={cosponsor} />}
      />
    </>
  );
}

/**
 * How one related measure relates to this one, with the body that said so named.
 *
 * @param relationships - Every recorded statement about the pair.
 * @returns e.g., `"Identical bill (CRS)"`, joined by middots — or an empty string when the record named none, which the
 *   caller renders as no line rather than as an empty one.
 */
function describeRelationships(relationships: RelatedBillRelationship[]): string {
  return relationships
    .map((relationship: RelatedBillRelationship): string =>
      relationship.identifiedBy ? `${relationship.type} (${relationship.identifiedBy})` : relationship.type,
    )
    .join(" · ");
}

/**
 * One related measure: its identity, its title, how the two are related, and its own latest action.
 *
 * Every relationship prints who identified it. Relatedness is an editorial judgment rather than a legislative act, and
 * the Congressional Research Service, the House, and the Senate each make their own; naming the source is the same
 * standard this app holds its own stage cue to. @see describeRelationships.
 *
 * @param measure - The related measure to render.
 * @returns The row.
 */
function RelatedBillRow({ measure }: { measure: RelatedBill }): JSX.Element {
  const relationships: string = describeRelationships(measure.relationships);

  return (
    <li>
      <p className="related-bill-list__identity">
        <Link className="text-link" href={billHref(measure)}>
          {measure.type} {measure.number}
        </Link>
        {/* Always printed rather than guarded: `congress` is required on the model, and a related measure can sit in a
            different Congress from the bill pointing at it, so the number is doing real work here. */}
        <span className="date-label"> · {formatOrdinal(measure.congress)} Congress</span>
      </p>
      <p className="related-bill-list__title">{measure.title}</p>
      {relationships.length > 0 ? <p className="date-label">{relationships}</p> : null}
      {measure.latestAction ? (
        // The other measure's own words, so they get the same glossary treatment this bill's latest action does.
        <p className="related-bill-list__action">
          <GlossaryProse text={measure.latestAction.text} />
        </p>
      ) : null}
    </li>
  );
}

/**
 * The other measures Congress.gov records as related to this bill, each linking to its page here.
 *
 * This answers the question a reader most often arrives at a House bill with — "is there a Senate version?" — and the
 * publisher's own order is kept, since the API documents no meaning for it. @see getRelatedBills.
 *
 * @param related - The related measures, in the publisher's order.
 * @returns The list, its tail behind a disclosure.
 */
function RelatedBillList({ related }: { related: RelatedBill[] }): JSX.Element {
  return (
    <DisclosedList
      items={related}
      keyFor={billIdentityKey}
      limit={RELATED_BILL_PREVIEW_LIMIT}
      listClassName="related-bill-list"
      moreLabel={(remaining: number): string => `Show the Remaining ${remaining} Related Measures`}
      renderItem={(measure: RelatedBill): JSX.Element => <RelatedBillRow measure={measure} />}
    />
  );
}

/**
 * What a committee did with the bill, as one line.
 *
 * @param activities - The recorded activities, in the order the record lists them.
 * @returns e.g., `"Referred To · Markup By · Reported By"`, or an empty string when the record named nothing this app
 *   can print — which the caller renders as no line at all rather than as an empty one.
 */
function describeCommitteeActivity(activities: BillCommitteeActivity[]): string {
  return activities.map((activity: BillCommitteeActivity): string => activity.name).join(" · ");
}

/**
 * The committees a bill passed through, each linking to its own page here.
 *
 * This is the referral read as the record states it rather than as the prose implies it. The same fact is already on
 * this page twice — in the latest action, and again in the action history — but only as a sentence, and a sentence
 * carries no system code. The `/committees` sub-resource carries one, which is the whole difference between naming a
 * committee and being able to open it.
 *
 * The link goes inward, on the same reasoning as the sponsor line above it: the committee's own page collects its name
 * history, its subcommittees, and the rest of what it has handled — and it carries the outbound links onward.
 *
 * @param committees - The committees to list, in the publisher's order. Primary committee first, and not re-sorted.
 * @returns The referral list.
 */
function CommitteeReferrals({ committees }: { committees: BillCommittee[] }): JSX.Element {
  return (
    <ul className="bill-committee-list">
      {committees.map((committee: BillCommittee): JSX.Element => {
        const activity: string = describeCommitteeActivity(committee.activities);

        return (
          <li key={`${committee.chamber}-${committee.systemCode}`}>
            <Link className="text-link" href={committeeHref(committee.chamber, committee.systemCode)}>
              {committee.name}
            </Link>
            {activity.length > 0 ? <p className="date-label">{activity}</p> : null}
            {committee.subcommittees.length > 0 ? (
              <ul className="bill-committee-list__subcommittees">
                {committee.subcommittees.map(
                  (subcommittee: BillSubcommittee): JSX.Element => (
                    <li key={subcommittee.systemCode}>
                      <Link className="text-link" href={committeeHref(committee.chamber, subcommittee.systemCode)}>
                        {subcommittee.name}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The roll-call votes taken on a bill, each linking to the chamber's own tally.
 *
 * What this section does *not* do is as deliberate as what it does. It prints no counts, no margins, and no member
 * positions — Congress.gov's bill record names the votes but does not carry their arithmetic, and the chambers publish
 * the arithmetic themselves. So this says a recorded vote happened, which chamber took it, and where the numbers are.
 *
 * The House/Senate asymmetry a reader might notice is upstream, not here: Congress.gov has a dedicated House vote
 * resource and no Senate counterpart, but both chambers' roll calls are referenced from a bill's own actions, which is
 * what this reads. So both appear, on the same footing.
 *
 * @param votes - Every distinct recorded vote on the bill, most recent first.
 * @returns The vote list, or a line saying none is on the record.
 */
function RecordedVotes({ votes }: { votes: RecordedVote[] }): JSX.Element {
  if (votes.length === 0) {
    return (
      <p className="muted-copy">
        No recorded vote appears in this bill’s actions. Most questions are settled by voice vote, which puts no
        individual position on the record at all — so this is an ordinary state, not a gap.{" "}
        <Link className="text-link" href={lessonHref("how-congress-votes")}>
          How Congress votes
        </Link>
        .
      </p>
    );
  }

  return (
    <>
      {/* Deliberately not phrased as "Congress.gov records N votes", the way the surrounding sections are. There is no
          published count to read here, and the number is this app's own in a stronger sense than a fetched array's
          length: `collectRecordedVotes` deduplicates a roll call that the chamber's floor log and the Library of
          Congress both attached to their own action, so Congress.gov's record genuinely contains more references than
          this says. The sentence claims the dedup rather than attributing it upstream. */}
      <p className="muted-copy">
        This bill’s actions reference {votes.length} distinct recorded {pluralize(votes.length, "vote")}. The tallies
        themselves — the counts, and who voted which way — live in each chamber’s own record, linked below.
      </p>
      <ul className="recorded-vote-list">
        {votes.map(
          (vote: RecordedVote): JSX.Element => (
            <li key={`${vote.chamber}-${vote.congress}-${vote.sessionNumber ?? ""}-${vote.rollNumber}`}>
              <p className="recorded-vote-list__roll">
                {vote.chamber} Roll Call {vote.rollNumber}
                {vote.date ? ` · ${formatDate(vote.date)}` : ""}
              </p>
              <OutboundLink href={vote.url} iconSize={13}>
                {vote.chamber === "House" ? "Office of the Clerk tally" : "Senate tally"}
              </OutboundLink>
            </li>
          ),
        )}
      </ul>
    </>
  );
}

/**
 * The bill's full action history, collapsed.
 *
 * Collapsed rather than dropped, and undeduplicated rather than tidied: Congress.gov reports the same moment from
 * several source systems at once, so consecutive rows can describe one event twice. That repetition is the record's
 * own shape, and flattening it would mean this app deciding which of two official logs to believe.
 *
 * @param actions - Every action on file, most recent first.
 * @returns The collapsible history, or nothing at all when there is none to show.
 */
function ActionHistory({ actions }: { actions: BillAction[] }): JSX.Element | null {
  if (actions.length === 0) return null;

  return (
    <details className="summary-history">
      <summary className="summary-history__toggle">
        Read All {actions.length} {pluralize(actions.length, "Action")}
      </summary>
      {/* Keyed partly by position, which is the correct key here rather than a lazy one: an action carries no
          identifier of its own, and the endpoint deliberately returns near-duplicate rows — the same moment logged by
          two source systems — so date, code, and text together still don't separate every pair. The list is
          server-rendered from a fixed array and is never reordered or filtered. */}
      <ol className="action-history__list">
        {actions.map(
          (action: BillAction, index: number): JSX.Element => (
            // biome-ignore lint/suspicious/noArrayIndexKey: no per-action identifier exists; see the note above.
            <li key={`${action.date ?? ""}-${action.actionCode ?? ""}-${index}`}>
              {action.date ? <p className="date-label">{formatDate(action.date)}</p> : null}
              {/* Congress's own words, like the latest-action line above — and the same reason for annotating them. */}
              <p className="action-history__text">
                <GlossaryProse text={action.text} />
              </p>
            </li>
          ),
        )}
      </ol>
    </details>
  );
}

/**
 * The caption above a summary, stating who wrote it and which version of the bill it describes.
 *
 * Preview summaries are captioned as illustrative rather than credited to the Congressional Research Service —
 * attributing invented text to a real institution is exactly the kind of accidental misinformation the preview-data
 * policy exists to prevent.
 *
 * @param summary - The summary being captioned.
 * @param source - Whether this record is live or preview data.
 * @returns The caption line.
 */
function SummaryCaption({
  summary,
  source,
}: {
  summary: BillSummary;
  source: CongressSnapshot["source"];
}): JSX.Element {
  if (source === "preview") return <p className="date-label">Illustrative preview summary — not a real CRS summary.</p>;

  return (
    <p className="date-label">
      Congressional Research Service summary — {summary.actionDesc}
      {summary.actionDate ? `, ${formatDate(summary.actionDate)}` : ""}
    </p>
  );
}

/**
 * Renders one summary's sanitized HTML.
 *
 * @param summary - The summary to render. Its `html` was already run through `sanitizeSummaryHtml` in the adapter
 *   (allow-listed tags, validated hrefs only) before it reached the app's model, so no unsanitized markup can arrive
 *   here.
 * @returns The summary body.
 */
function SummaryBody({ summary }: { summary: BillSummary }): JSX.Element {
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: html is sanitized by sanitizeSummaryHtml in the adapter.
    <div className="summary-body" dangerouslySetInnerHTML={{ __html: summary.html }} />
  );
}

/**
 * Full bill record page.
 *
 * Purely presentational: every value is resolved by the route (`page.tsx`) and passed in, so this component has no
 * fetching, no environment access, and nothing that behaves differently between a live and a preview render except the
 * wording it chooses.
 *
 * @param props - @see BillDetailProps
 * @returns The hero (identity, stage, sponsor and cosponsor meta), the `BillJourney` stepper, the latest action with a
 *   link to the official record, the CRS summaries, every official text version, and the closing context card.
 */
export function BillDetail({
  bill,
  source,
  notice,
  retrievedAt,
  summaries,
  textVersions,
  actions,
  committees,
  cosponsors,
  related,
}: BillDetailProps): JSX.Element {
  const [summary, ...earlierSummaries]: BillSummary[] = summaries;
  const votes: RecordedVote[] = collectRecordedVotes(actions);
  // The action history is the better authority on where a bill has got to: `bill.stage` was read off one line of prose,
  // and the latest action of a bill that has passed one chamber usually describes a referral in the other.
  // @see resolveBillStage.
  const stage: BillStage = resolveBillStage(bill.stage, actions);

  return (
    <SiteShell>
      <div className="bill-backlink">
        <Link href="/bills">
          <ChevronLeft aria-hidden="true" size={16} /> All Bills
        </Link>
      </div>

      <section className="bill-detail-hero" aria-labelledby="bill-title">
        <p className="eyebrow">
          {bill.type} {bill.number} · {formatOrdinal(bill.congress)} Congress
        </p>
        <h1 id="bill-title">{bill.title}</h1>
        <div className="bill-detail-meta">
          <span className="stage-label">{billStageLabels[stage]}</span>
          {/* The citation Congress.gov publishes on the record itself, not one this app assembled from a stage. It is
              the one thing on this page that settles what became of the bill outright, so it sits beside the stage
              cue — which is explicitly an orientation aid — rather than somewhere further down. */}
          {bill.enactedLaw ? <span className="law-label">{formatEnactedLaw(bill.enactedLaw)}</span> : null}
          {bill.policyArea ? <span>{bill.policyArea}</span> : null}
          <span>Origin: {bill.originChamber}</span>
          {bill.introducedDate ? <span>Introduced {formatDate(bill.introducedDate)}</span> : null}
          {bill.sponsor ? (
            <span>
              Sponsor:{" "}
              {bill.sponsor.bioguideId ? (
                // Links inward rather than straight out to the Biographical Directory: the sponsor's own page collects
                // their seat, service record, and the rest of what they've introduced — and carries the official
                // biography link onward, so nothing is lost by making this the first stop instead of the last.
                <Link className="text-link" href={memberHref(bill.sponsor.bioguideId)}>
                  {bill.sponsor.fullName}
                </Link>
              ) : (
                bill.sponsor.fullName
              )}
            </span>
          ) : null}
          {typeof bill.cosponsorTally?.current === "number" ? (
            <span>
              {bill.cosponsorTally.current} <GlossaryProse text={pluralize(bill.cosponsorTally.current, "Cosponsor")} />
            </span>
          ) : null}
        </div>
      </section>

      <DataSourceNotice source={source} notice={notice} retrievedAt={retrievedAt} />

      <div className="detail-grid">
        <DetailPanel headingId="journey-heading" kicker="How This Moves" heading="The Bill’s Journey">
          <p className="muted-copy">
            This is an orientation aid, not an official legal status. Read the latest action and primary source
            alongside it.
          </p>
          <BillJourney stage={stage} compact={false} />
        </DetailPanel>

        <DetailPanel
          accent
          as="aside"
          heading="What Happened Most Recently"
          headingId="next-heading"
          kicker="Latest Action"
        >
          {/* The one line on this page written in Congress's own voice rather than this app's — "Referred to the
              Committee on…", "Passed Senate without amendment" — which makes it the place a reader is most likely to
              hit a word they don't have. @see GlossaryProse. */}
          <p className="latest-action-copy">
            <GlossaryProse text={bill.latestAction.text} />
          </p>
          {bill.latestAction.date ? <p className="date-label">Recorded {formatDate(bill.latestAction.date)}</p> : null}
          <OutboundLink href={bill.officialUrl}>Open the Official Record</OutboundLink>
        </DetailPanel>
      </div>

      <div className="detail-grid detail-grid--single">
        <DetailPanel headingId="committees-heading" kicker="Who Has Held It" heading="Committees of Referral">
          {committees.length > 0 ? (
            <>
              <p className="muted-copy">
                {describeBillCollection({
                  shown: committees.length,
                  published: bill.collectionCounts?.committees,
                  noun: "committee",
                })}{" "}
                They are listed in Congress.gov’s own order — the committee of primary jurisdiction first. Each links to
                its record here. Most bills referred to a committee never leave it, so a referral says where a bill
                went, not how it fared.
              </p>
              <CommitteeReferrals committees={committees} />
            </>
          ) : (
            <EmptySectionNote
              absence="No committee referral appears on this bill’s record. A resolution taken up directly on the floor never acquires one, so this is an ordinary state rather than a gap."
              previewLead="Committees of referral appear"
              source={source}
            />
          )}
        </DetailPanel>
      </div>

      {/* Sits here, between the committees that held the bill and the actions taken on it, because it answers the
          question the hero's sponsor line opens and cannot close: one name introduced this, and these are the others
          who put theirs to it. */}
      <div className="detail-grid detail-grid--single">
        <DetailPanel headingId="cosponsors-heading" kicker="Who Else Put Their Name To It" heading="Cosponsors">
          {cosponsors.length > 0 ? (
            <>
              <CosponsorList cosponsors={cosponsors} source={source} tally={bill.cosponsorTally} />
              <p className="muted-copy">
                Cosponsoring records that a member supported introducing a measure. It is not a vote, not a prediction,
                and not a ranking — most cosponsored bills never reach a floor.
              </p>
            </>
          ) : (
            <EmptySectionNote
              absence="No member has cosponsored this bill. A measure can move through Congress on its sponsor’s name alone, so this is an ordinary state rather than a gap."
              previewLead="Cosponsors appear"
              source={source}
            />
          )}
        </DetailPanel>
      </div>

      <div className="detail-grid">
        <DetailPanel headingId="actions-heading" kicker="Every Step on the Record" heading="What Congress Actually Did">
          {actions.length > 0 ? (
            <p className="muted-copy">
              {describeBillCollection({
                shown: actions.length,
                published: bill.collectionCounts?.actions,
                noun: "action",
              })}{" "}
              The same moment is often logged twice, by the chamber’s floor record and by the Library of Congress — both
              are kept here rather than merged.
            </p>
          ) : (
            <EmptySectionNote
              absence="No action history could be read for this bill."
              previewLead="The action history appears"
              source={source}
            />
          )}
          <ActionHistory actions={actions} />
        </DetailPanel>

        <DetailPanel
          accent
          as="aside"
          heading="Recorded Votes"
          headingId="votes-heading"
          kicker="Where Names Went on the Record"
        >
          {source === "preview" ? (
            <p className="muted-copy">{previewPendingCopy("Recorded votes appear")}</p>
          ) : (
            <RecordedVotes votes={votes} />
          )}
        </DetailPanel>
      </div>

      <div className="detail-grid">
        <DetailPanel headingId="summary-heading" kicker="In Plain English" heading="What This Bill Would Do">
          {summary ? (
            <>
              <SummaryCaption summary={summary} source={source} />
              <SummaryBody summary={summary} />
              {earlierSummaries.length > 0 ? (
                <>
                  <p className="muted-copy">
                    {describeBillCollection({
                      shown: summaries.length,
                      published: bill.collectionCounts?.summaries,
                      noun: "Congressional Research Service summary",
                      pluralNoun: "Congressional Research Service summaries",
                    })}{" "}
                    The one above is the most recent; earlier ones may describe an earlier version of the text.
                  </p>
                  {/* Kept collapsed rather than dropped: an earlier summary isn't stale, it's an accurate description
                      of a real earlier version of the bill, and comparing the two is one of the clearest ways to see
                      what a chamber actually changed. */}
                  <details className="summary-history">
                    <summary className="summary-history__toggle">
                      Read the {earlierSummaries.length} Earlier{" "}
                      {pluralize(earlierSummaries.length, "Summary", "Summaries")}
                    </summary>
                    <ol className="summary-history__list">
                      {earlierSummaries.map(
                        (earlier: BillSummary): JSX.Element => (
                          <li key={`${earlier.versionCode}-${earlier.actionDate ?? earlier.actionDesc}`}>
                            <SummaryCaption summary={earlier} source={source} />
                            <SummaryBody summary={earlier} />
                          </li>
                        ),
                      )}
                    </ol>
                  </details>
                </>
              ) : null}
            </>
          ) : (
            <EmptySectionNote
              absence="The Congressional Research Service hasn't published a summary for this bill yet."
              previewLead="Summaries appear"
              source={source}
            />
          )}
        </DetailPanel>

        <DetailPanel
          accent
          as="aside"
          heading="Read the Full Text"
          headingId="fulltext-heading"
          kicker="Primary Source"
        >
          {textVersions.length > 0 ? (
            <>
              {/* The collection where a gap between the published figure and the shown one is most expected:
                  `mapCongressTextVersion` drops a version carrying no linkable rendering, since a heading with nothing
                  behind it is not a row. Naming both figures is what keeps that drop from reading as the record being
                  shorter than it is. */}
              <p className="muted-copy">
                {describeBillCollection({
                  shown: textVersions.length,
                  published: bill.collectionCounts?.textVersions,
                  noun: "text version",
                })}{" "}
                Each links to Congress.gov’s own documents rather than to text re-hosted here.
              </p>
              <ul className="text-version-list">
                {textVersions.map(
                  (version: BillTextVersion, index: number): JSX.Element => (
                    <li key={`${version.type}-${version.date ?? index}`}>
                      <p className="text-version-list__type">
                        {version.type}
                        {version.date ? ` · ${formatDate(version.date)}` : ""}
                      </p>
                      <div className="text-version-list__formats">
                        {version.formats.map(
                          (format: BillTextFormat): JSX.Element => (
                            <OutboundLink key={format.url} href={format.url} iconSize={13}>
                              {format.type}
                            </OutboundLink>
                          ),
                        )}
                      </div>
                    </li>
                  ),
                )}
              </ul>
            </>
          ) : (
            <EmptySectionNote
              absence="Congress.gov hasn't published bill text for this record yet."
              previewLead="Full-text links appear"
              source={source}
            />
          )}
        </DetailPanel>
      </div>

      {/* Last of the record sections, and outward-facing on purpose: everything above is about this bill, and this is
          where a reader leaves it for the companion measure in the other chamber. */}
      <div className="detail-grid detail-grid--single">
        <DetailPanel headingId="related-heading" kicker="Elsewhere in Congress" heading="Related Measures">
          {related.length > 0 ? (
            <>
              <p className="muted-copy">
                {describeBillCollection({
                  shown: related.length,
                  published: bill.collectionCounts?.relatedBills,
                  noun: "related measure",
                })}{" "}
                Each is listed with the body that identified the relationship — the Congressional Research Service, the
                House, or the Senate — because relating two measures is a judgment someone made rather than something
                the bills themselves record. They are in Congress.gov’s own order, which the API documents no meaning
                for, so neither end of this list is the most significant.
              </p>
              <RelatedBillList related={related} />
            </>
          ) : (
            <EmptySectionNote
              absence="Congress.gov records no measure as related to this one. Most bills have no companion, so this is an ordinary state rather than a gap."
              previewLead="Related measures appear"
              source={source}
            />
          )}
        </DetailPanel>
      </div>

      <CalloutCard
        body="The summary above is written by the Congressional Research Service, not Civic Ledger — use the linked full text for anything definitive. Update alerts are next, without obscuring the original record."
        heading="A Record Is a Starting Point, Not the Whole Story."
        headingId="reading-heading"
        href="/learn"
        icon={Landmark}
        kicker="Read It With Context"
        linkIcon={ArrowUpRight}
        linkLabel="Learn the Terms"
      />
    </SiteShell>
  );
}
