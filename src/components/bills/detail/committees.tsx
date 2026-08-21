import Link from "next/link";
import type { JSX } from "react";

import type { BillSectionProps } from "@/components/bills/detail/section";
import { DetailPanel } from "@/components/ui/detail-panel";
import { EmptySectionNote } from "@/components/ui/empty-section-note";
import { describeBillCollection } from "@/lib/congress/bills/model";
import type { BillCommittee, BillCommitteeActivity, BillSubcommittee } from "@/lib/congress/committees/model";
import { committeeHref } from "@/lib/routes";

/**
 * The committees a bill was referred to: the panel, the nested list of parents and subcommittees, and the line that
 * words what each one did with it.
 *
 * The one collection on this page whose facts appear twice elsewhere on it — the referral is in the latest action and
 * again in the action history — and it is here anyway, because those two say it as prose. Prose carries no system code,
 * and a system code is the whole difference between naming a committee and being able to open it.
 */

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
