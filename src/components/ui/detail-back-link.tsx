import { ChevronLeft } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { JSX } from "react";

/** Props for {@link DetailBackLink}. */
type DetailBackLinkProps = {
  /** The directory this record belongs to — `/bills`, `/members`, `/committees`. */
  href: Route;
  /**
   * How the link reads, e.g., `"All Bills"`. Names the collection rather than saying "Back".
   *
   * @see DetailBackLink
   */
  label: string;
};

/**
 * The link out of a single record and back up to the directory it came from, shared by all three detail pages so the
 * chevron's size and `aria-hidden` can't drift between them.
 *
 * The label names the destination ("All Committees") rather than saying "Back": it reads on its own in a screen
 * reader's links list, and it's honest — this goes to the directory, not a history step, and a record reached from a
 * sponsor line or a search result came from somewhere else.
 *
 * @param props - {@link DetailBackLinkProps}.
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
