import type { JSX } from "react";

import type { BillSectionProps } from "@/components/bills/detail/section";
import { DetailPanel } from "@/components/ui/detail-panel";
import { EmptySectionNote } from "@/components/ui/empty-section-note";
import { RecordLink } from "@/components/ui/record-link";
import { describeBillCollection } from "@/lib/congress/bills/model";
import type { BillCommittee, BillCommitteeActivity, BillSubcommittee } from "@/lib/congress/committees/model";
import { committeeHref } from "@/lib/routes";

/**
 * What a committee did with the bill, as one line.
 *
 * @param activities - The recorded activities, in the order the record lists them.
 * @returns e.g., `"Referred To · Markup By · Reported By"`, or `""` when the record named nothing printable.
 */
function describeCommitteeActivity(activities: BillCommitteeActivity[]): string {
  return activities.map((activity: BillCommitteeActivity): string => activity.name).join(" · ");
}

/**
 * The committees a bill passed through, each linking to its page here. The action history mentions referrals only as
 * prose; this sub-resource carries the system codes that make a committee linkable.
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
            <RecordLink className="text-link" href={committeeHref(committee.chamber, committee.systemCode)}>
              {committee.name}
            </RecordLink>
            {activity.length > 0 ? <p className="date-label">{activity}</p> : null}
            {committee.subcommittees.length > 0 ? (
              <ul className="bill-committee-list__subcommittees">
                {committee.subcommittees.map(
                  (subcommittee: BillSubcommittee): JSX.Element => (
                    <li key={subcommittee.systemCode}>
                      <RecordLink
                        className="text-link"
                        href={committeeHref(committee.chamber, subcommittee.systemCode)}
                      >
                        {subcommittee.name}
                      </RecordLink>
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
 * Every committee the bill was referred to, in Congress.gov's own order.
 *
 * @param props - @see BillSectionProps
 * @returns The committees panel.
 */
export function CommitteesPanel({ resource, published, source }: BillSectionProps<BillCommittee>): JSX.Element {
  const { entries: committees, unavailable } = resource;

  return (
    <DetailPanel headingId="committees-heading" kicker="Who Has Held It" heading="Committees of Referral">
      {committees.length > 0 ? (
        <>
          <p className="muted-copy">
            {describeBillCollection({ shown: committees.length, published, noun: "committee" })} They are listed in
            Congress.gov’s own order — the committee of primary jurisdiction first. Each links to its record here. Most
            bills referred to a committee never leave it, so a referral says where a bill went, not how it fared.
          </p>
          <CommitteeReferrals committees={committees} />
        </>
      ) : (
        <EmptySectionNote
          absence="No committee referral appears on this bill’s record. A resolution taken up directly on the floor never acquires one, so this is an ordinary state rather than a gap."
          previewLead="Committees of referral appear"
          source={source}
          unavailable={unavailable}
          unavailableLead="Committees of referral are"
          unavailableSubject="this bill was referred to any"
        />
      )}
    </DetailPanel>
  );
}
