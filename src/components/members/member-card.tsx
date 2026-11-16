import type { JSX } from "react";

import { MemberPortrait } from "@/components/members/member-portrait";
import { RecordLink } from "@/components/ui/record-link";
import {
  chamberLabels,
  chamberShortLabels,
  formatMemberParty,
  formatMemberSeat,
  type MemberDirectoryEntry,
  partyTintClass,
} from "@/lib/congress/members/model";
import { memberHref } from "@/lib/routes";

/**
 * Compact member summary card, used in the `/members` directory grid.
 *
 * One link, on the name. {@link BillCard} adds a corner arrow because a long wrapping headline is hard to hit; a name
 * isn't, so a second link would only be a duplicate for assistive technology to announce.
 *
 * The portrait's `alt` is empty: the linked name follows immediately, so describing the image would announce the same
 * person twice. On the member's own page, where the portrait stands alone, its `alt` does real work.
 *
 * @param entry - The member to summarize.
 * @returns The card: portrait where one exists, party, linked name, and the seat they hold.
 */
export function MemberCard({ entry }: { entry: MemberDirectoryEntry }): JSX.Element {
  const seat: string = formatMemberSeat(entry, entry.chamber);

  return (
    <article className="member-card">
      <MemberPortrait alt="" depiction={entry.depiction} variant="card" />
      <p className={`member-card__party ${partyTintClass(entry.party)}`}>{formatMemberParty(entry)}</p>
      <h3 className="member-card__name">
        <RecordLink href={memberHref(entry.bioguideId)}>{entry.name}</RecordLink>
      </h3>
      <p className="member-card__seat">
        {seat.length > 0 ? `${chamberShortLabels[entry.chamber]} · ${seat}` : chamberLabels[entry.chamber]}
      </p>
    </article>
  );
}
