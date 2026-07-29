import Link from "next/link";
import type { JSX } from "react";

import {
  chamberLabels,
  chamberShortLabels,
  formatMemberParty,
  formatMemberSeat,
  type MemberDirectoryEntry,
  partyTintClass,
} from "@/lib/congress/members";
import { memberHref } from "@/lib/member-route";

/**
 * Compact member summary card, used in the `/members` directory grid.
 *
 * Unlike {@link BillCard}, this carries a single link rather than a title link plus a corner arrow. That arrow exists
 * on a bill card because a bill's only target is a long, wrapping headline that is awkward to hit; a person's name is
 * short and reliably clickable, so a second link to the same place would only give assistive technology a duplicate to
 * announce for no gain.
 *
 * @param entry - The member to summarize.
 * @returns The card: party, linked name, and the seat they hold.
 */
export function MemberCard({ entry }: { entry: MemberDirectoryEntry }): JSX.Element {
  const seat: string = formatMemberSeat(entry, entry.chamber);

  return (
    <article className="member-card">
      <p className={`member-card__party ${partyTintClass(entry.party)}`}>{formatMemberParty(entry)}</p>
      <h3 className="member-card__name">
        <Link href={memberHref(entry.bioguideId)}>{entry.name}</Link>
      </h3>
      <p className="member-card__seat">
        {seat.length > 0 ? `${chamberShortLabels[entry.chamber]} · ${seat}` : chamberLabels[entry.chamber]}
      </p>
    </article>
  );
}
