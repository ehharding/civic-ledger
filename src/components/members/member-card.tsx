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
 * Unlike {@link BillCard}, this carries a single link rather than a title link plus a corner arrow. That arrow exists
 * on a bill card because a bill's only target is a long, wrapping headline that is awkward to hit; a person's name is
 * short and reliably clickable, so a second link to the same place would only give assistive technology a duplicate to
 * announce for no gain.
 *
 * The portrait is decorative in the accessibility sense and carries an empty `alt` deliberately: the member's name is
 * the very next thing in the card and is the link, so describing the image would make a screen reader announce the same
 * person twice — once as "Official portrait of Leahy, Patrick J." and again as the link. That is the opposite of the
 * member's own page, where the portrait is the only place the person is depicted and its `alt` does real work.
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
