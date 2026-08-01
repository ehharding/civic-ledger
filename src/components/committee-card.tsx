import Link from "next/link";
import type { JSX } from "react";

import { committeeHref } from "@/lib/committee-route";
import { type CommitteeSummary, committeeChamberShortLabels, committeeTypeLabels } from "@/lib/congress/committees";
import { pluralize } from "@/lib/format";

/**
 * Compact committee summary card, used in the `/committees` directory grid.
 *
 * Built on the same rules as {@link MemberCard}: one link, on the name, rather than a title link plus a corner arrow. A
 * committee's name is the only thing here worth opening, and a second link to the same place would only give assistive
 * technology a duplicate to announce.
 *
 * The subcommittee count is on the card rather than only on the committee's own page because it is the one fact that
 * explains why the directory is shorter than a reader might expect — the list holds parent committees, and this is what
 * says how much sits one level below each of them.
 * @see buildCommitteeDirectory.
 *
 * @param committee - The committee to summarize.
 * @returns The card: type chip, linked name, and the chamber and subcommittee count.
 */
export function CommitteeCard({ committee }: { committee: CommitteeSummary }): JSX.Element {
  const subcommittees: number = committee.subcommitteeCount;

  return (
    <article className="committee-card">
      <p className={`committee-card__type committee-type--${committee.type}`}>{committeeTypeLabels[committee.type]}</p>
      <h3 className="committee-card__name">
        {/* Displayed exactly as Congress.gov publishes it. @see committeeSearchTerms for why the leading form a
            referral line uses is matched by the search box but never substituted here. */}
        <Link href={committeeHref(committee.chamber, committee.systemCode)}>{committee.name}</Link>
      </h3>
      <p className="committee-card__meta">
        {committeeChamberShortLabels[committee.chamber]}
        {subcommittees > 0 ? ` · ${subcommittees} ${pluralize(subcommittees, "subcommittee")}` : ""}
      </p>
    </article>
  );
}
