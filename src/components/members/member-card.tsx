import Link from "next/link";
import type { JSX } from "react";

import {
  chamberLabels,
  chamberShortLabels,
  formatMemberParty,
  formatMemberSeat,
  type MemberDirectoryEntry,
  partyTintClass,
} from "@/lib/congress/members/model";
import { memberHref } from "@/lib/member-route";

/**
 * The member's portrait, with the credit line Congress.gov's terms require beside it.
 *
 * A plain `<img>` for the same reason `MemberPortrait` on the member's own page is one, and `loading="lazy"` matters
 * far more here: a directory is several hundred cards, of which a reader sees a dozen, so the rest are never fetched at
 * all until they are scrolled to.
 *
 * The credit is rendered rather than omitted for space. It is the condition on showing the image at all, and a grid
 * is exactly where it would be tempting to drop — several hundred identical "Image courtesy of the Member" lines look
 * like noise right up until the one that says something else. It is styled small and quiet, not hidden: a credit only
 * sighted readers cannot see is not a credit.
 *
 * @param entry - The member whose portrait to render.
 * @returns The portrait and its credit, or `null` when Congress.gov publishes no image for this member — which is every
 *   preview placeholder, and a small number of live records.
 */
function MemberCardPortrait({ entry }: { entry: MemberDirectoryEntry }): JSX.Element | null {
  if (!entry.depiction) return null;

  return (
    <figure className="member-card__portrait">
      {/* biome-ignore lint/performance/noImgElement: same reasoning as MemberPortrait in member-detail.tsx — next/image
          would need every congress.gov portrait host allow-listed in next.config.ts, where an un-listed host is a hard
          runtime error rather than a missing picture, and the static export disables optimization. */}
      <img
        alt=""
        className="member-card__portrait-image"
        height={110}
        loading="lazy"
        src={entry.depiction.imageUrl}
        width={88}
      />
      {entry.depiction.attribution ? (
        <figcaption className="member-card__portrait-credit">
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by sanitizeSummaryHtml in the adapter. */}
          <span dangerouslySetInnerHTML={{ __html: entry.depiction.attribution }} />
        </figcaption>
      ) : null}
    </figure>
  );
}

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
      <MemberCardPortrait entry={entry} />
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
