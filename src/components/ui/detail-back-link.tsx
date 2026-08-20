import { ChevronLeft } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { JSX } from "react";

/** Props for {@link DetailBackLink}. */
type DetailBackLinkProps = {
  /** The directory this record belongs to — `/bills`, `/members`, `/committees`. */
  href: Route;
  /** How the link reads, e.g., `"All Bills"`. Names the collection rather than saying "Back". @see DetailBackLink. */
  label: string;
};

/**
 * The link out of a single record and back up to the directory it came from.
 *
 * All three detail pages open with one, and they opened with three copies of the same five lines until this
 * existed — identical down to the glyph's `aria-hidden` and its 16px size, and sharing a `.bill-backlink` class that
 * two of the three pages had no business wearing. That is the shape a drift arrives in: the next page to grow one of
 * these gets a 15px chevron, or forgets the `aria-hidden` and has a screen reader announce "chevron left All Members",
 * and nothing about either is visible in the diff that causes it.
 *
 * **The label names the destination rather than saying "Back", and that is the accessibility half of this.** A screen
 * reader can list a page's links out of context, where three pages' worth of "Back" is three links to nowhere in
 * particular; "All Committees" says where it goes on its own. It is also more honest than "Back": this is a link to the
 * directory, not a history step, and on a record reached from a bill's sponsor line or a search result those are
 * different places.
 *
 * @param props - @see DetailBackLinkProps
 * @returns The back link, with its leading chevron.
 */
export function DetailBackLink({ href, label }: DetailBackLinkProps): JSX.Element {
  return (
    <div className="detail-backlink">
      <Link href={href}>
        <ChevronLeft aria-hidden="true" size={16} /> {label}
      </Link>
    </div>
  );
}
