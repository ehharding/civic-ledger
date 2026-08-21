import Link from "next/link";
import type { JSX } from "react";

import { type BillSectionProps, DisclosedList } from "@/components/bills/detail/section";
import { DetailPanel } from "@/components/ui/detail-panel";
import { EmptySectionNote } from "@/components/ui/empty-section-note";
import {
  type BillCosponsor,
  type BillCosponsorTally,
  type CongressSnapshot,
  describeBillCollection,
  describeOriginalCosponsors,
  describeWithdrawnCosponsors,
} from "@/lib/congress/bills/model";
import { normalizePartyCode, type PartyGroup, partyTintClass } from "@/lib/congress/members/model";
import { formatDate } from "@/lib/format";
import { memberHref } from "@/lib/routes";

/**
 * Everyone who signed on to a bill after its sponsor: the panel, the list and its counting sentences, and one member's
 * row.
 *
 * The section with the most ways to say something untrue about a record, which is why the three pieces are kept
 * together: an original cosponsor is a published boolean rather than a date comparison, a withdrawal is a fact the
 * tally carries and the list does not, and a preview bill has a real-looking tally over three invented names. Each of
 * those is a rule about what may be claimed, and each is enforced a few lines from the markup that would break it.
 */

/**
 * How many cosponsors are shown before the rest move behind a disclosure.
 *
 * A bill can carry four hundred names, and a page that prints all of them puts every section below it — the summary,
 * the full text, the related measures — an unreasonable scroll away. Twelve is enough to see the shape of who signed
 * on, including whether the list crosses party lines, while keeping the rest of the page reachable. Nothing is
 * dropped: the remainder is one click away, in the same `<details>` idiom the action history and the earlier summaries
 * use.
 */
const COSPONSOR_PREVIEW_LIMIT: number = 12;

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
 * content; the same rule spells the summary caption. @see SummaryCaption, and docs/data-policy.md.
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
 * Everyone who signed on after the sponsor.
 *
 * @param props - @see BillSectionProps, plus the publisher's own tally.
 * @returns The cosponsors panel.
 */
export function CosponsorsPanel({
  resource,
  source,
  tally,
}: Omit<BillSectionProps<BillCosponsor>, "published"> & { tally?: BillCosponsorTally }): JSX.Element {
  const { entries: cosponsors, unavailable } = resource;

  return (
    <DetailPanel headingId="cosponsors-heading" kicker="Who Else Put Their Name To It" heading="Cosponsors">
      {cosponsors.length > 0 ? (
        <>
          <CosponsorList cosponsors={cosponsors} source={source} tally={tally} />
          <p className="muted-copy">
            Cosponsoring records that a member supported introducing a measure. It is not a vote, not a prediction, and
            not a ranking — most cosponsored bills never reach a floor.
          </p>
        </>
      ) : (
        <EmptySectionNote
          absence="No member has cosponsored this bill. A measure can move through Congress on its sponsor’s name alone, so this is an ordinary state rather than a gap."
          previewLead="Cosponsors appear"
          source={source}
          unavailable={unavailable}
          unavailableLead="Cosponsors are"
          unavailableSubject="anyone signed on to this bill"
        />
      )}
    </DetailPanel>
  );
}
