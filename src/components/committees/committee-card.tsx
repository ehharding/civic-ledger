import type { JSX } from "react";

import { RecordLink } from "@/components/ui/record-link";
import {
  type CommitteeSummary,
  committeeChamberShortLabels,
  committeeTypeLabels,
} from "@/lib/congress/committees/model";
import { pluralize } from "@/lib/format";
import { committeeHref } from "@/lib/routes";

/**
 * Compact committee summary card, used in the `/committees` directory grid. One link, on the name, as on
 * {@link MemberCard}.
 *
 * The subcommittee count is here because the directory lists only parent committees, and this is what explains why it's
 * shorter than a reader might expect.
 *
 * @param committee - The committee to summarize.
 * @returns The card: type chip, linked name, and the chamber and subcommittee count.
 * @see buildCommitteeDirectory
 */
export function CommitteeCard({ committee }: { committee: CommitteeSummary }): JSX.Element {
  const subcommittees: number = committee.subcommitteeCount;

  return (
    <article className="committee-card">
      <p className={`committee-card__type committee-type--${committee.type}`}>{committeeTypeLabels[committee.type]}</p>
      <h3 className="committee-card__name">
        {/* Displayed exactly as Congress.gov publishes it. See committeeSearchTerms for why the leading form a referral
            line uses is matched by the search box but never substituted here. */}
        <RecordLink href={committeeHref(committee.chamber, committee.systemCode)}>{committee.name}</RecordLink>
      </h3>
      <p className="committee-card__meta">
        {committeeChamberShortLabels[committee.chamber]}
        {subcommittees > 0 ? ` · ${subcommittees} ${pluralize(subcommittees, "subcommittee")}` : ""}
      </p>
    </article>
  );
}
