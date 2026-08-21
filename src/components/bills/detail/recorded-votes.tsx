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

/**
 * The roll calls taken on a bill.
 *
 * Its own file rather than part of `actions.tsx`, despite reading the same resource: this is the one section on the
 * page that is *derived* rather than fetched, and keeping the derivation visible is the point. It also carries the
 * app's largest standing gap — Congress.gov publishes no Senate vote resource — which `docs/roadmap.md` tracks and
 * this section's own copy has to keep honest.
 */

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
 * @param unavailable - Whether the action history these were read from failed to load. This section is derived rather
 *   than fetched, so it inherits its uncertainty: with no actions to search, "no recorded vote appears in this bill's
 *   actions" describes an empty search rather than a quiet bill, and the two are not the same sentence.
 * @returns The vote list, a line saying the record could not be read, or a line saying none is on it.
 */
function RecordedVotes({ votes, unavailable }: { votes: RecordedVote[]; unavailable: boolean }): JSX.Element {
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
 * The roll calls found in the action history.
 *
 * Reads from the actions rather than from a collection of its own, which is why this takes the action resource: a
 * recorded vote reaches this app only as a link hanging off the action that produced it.
 * @see collectRecordedVotes
 *
 * @param props - @see BillSectionProps
 * @returns The recorded-votes panel.
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
