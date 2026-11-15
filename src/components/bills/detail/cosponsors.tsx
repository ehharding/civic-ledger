import type { JSX } from "react";

import { type BillSectionProps, DisclosedList } from "@/components/bills/detail/section";
import { DetailPanel } from "@/components/ui/detail-panel";
import { EmptySectionNote } from "@/components/ui/empty-section-note";
import { RecordLink } from "@/components/ui/record-link";
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
 * How many cosponsors show before the rest move behind a disclosure — enough to see who signed on without burying the
 * sections below under hundreds of names.
 */
const COSPONSOR_PREVIEW_LIMIT: number = 12;

/**
 * One cosponsor: who, which party, and when they signed on. Links to the member's page when there's a Bioguide ID.
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
          <RecordLink className="text-link" href={memberHref(cosponsor.bioguideId)}>
            {cosponsor.fullName}
          </RecordLink>
        ) : (
          cosponsor.fullName
        )}
      </span>
      <span className="cosponsor-list__meta">
        {/* "Original" is the record's own flag, not a date comparison. @see BillCosponsor */}
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
 * The members who signed on to a bill, in Congress.gov's oldest-first order (the bill gathering support over time).
 *
 * The published tally is dropped on a preview record: fixture bills carry one for the hero, and printing "Congress.gov
 * records 12 cosponsors" over invented names would credit a real institution with fiction.
 * @see docs/data-policy.md
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
