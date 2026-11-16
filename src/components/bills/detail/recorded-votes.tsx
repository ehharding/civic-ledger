import Link from "next/link";
import type { JSX } from "react";

import type { BillSectionProps } from "@/components/bills/detail/section";
import { DetailPanel } from "@/components/ui/detail-panel";
import { previewPendingCopy, unavailableCopy } from "@/components/ui/empty-section-note";
import { OutboundLink } from "@/components/ui/outbound-link";
import type { BillAction, RecordedVote } from "@/lib/congress/bills/model";
import { collectRecordedVotes } from "@/lib/congress/upstream/mappers";
import { formatDate, pluralize } from "@/lib/format";
import { lessonHref } from "@/lib/routes";

/** Props for {@link RecordedVotes}. */
type RecordedVotesProps = {
  /** Every distinct recorded vote on the bill, most recent first. */
  votes: RecordedVote[];
  /** Whether the action history failed to load, in which case "no recorded vote" can't be claimed. */
  unavailable: boolean;
};

/**
 * The roll-call votes taken on a bill, each linking to the chamber's own tally. No counts or positions: the bill record
 * names votes but doesn't carry their arithmetic. Both chambers' votes are read from the bill's actions, so they appear
 * on the same footing.
 *
 * @param props - {@link RecordedVotesProps}.
 * @returns The vote list, a line saying the record could not be read, or a line saying none is on it.
 */
function RecordedVotes({ votes, unavailable }: RecordedVotesProps): JSX.Element {
  if (votes.length === 0 && unavailable) {
    return <p className="muted-copy">{unavailableCopy("Recorded votes are", "any vote was taken on this bill")}</p>;
  }

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
 * The roll calls found in the action history — derived rather than fetched.
 *
 * @param props - {@link BillSectionProps}.
 * @returns The recorded-votes panel.
 * @see collectRecordedVotes
 */
export function RecordedVotesPanel({ resource, source }: Omit<BillSectionProps<BillAction>, "published">): JSX.Element {
  return (
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
        <RecordedVotes votes={collectRecordedVotes(resource.entries)} unavailable={resource.unavailable} />
      )}
    </DetailPanel>
  );
}
