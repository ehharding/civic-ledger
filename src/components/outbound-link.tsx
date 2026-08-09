import { ExternalLink } from "lucide-react";
import type { JSX, ReactNode } from "react";

import { ExternalLinkHint } from "@/components/external-link-hint";

/** Props for {@link OutboundLink}. */
type OutboundLinkProps = {
  /** The absolute URL to open. Always a primary source — Congress.gov, the Biographical Directory, a member's own site. */
  href: string;
  /** The visible link text. */
  children: ReactNode;
  /** Overrides the default `text-link` class when a caller needs to add its own layout class alongside it. */
  className?: string;
  /** Glyph size in pixels, so a link set in smaller copy can carry a proportionate icon. */
  iconSize?: number;
};

/**
 * A link that leaves this app for a primary source.
 *
 * Every outbound link in Civic Ledger owes a reader four things at once: `target="_blank"` to preserve their place in
 * the record they were reading, `rel="noreferrer"` so the destination learns nothing about where they came from, a
 * visible glyph marking the link as leaving, and — because that glyph is `aria-hidden` and conveys nothing to a screen
 * reader — the audible {@link ExternalLinkHint} warning that focus is about to move to a new tab.
 *
 * All four are composed here rather than spelled out per call site, so the accessibility half of the contract is a
 * thing a new link inherits rather than a thing it has to *remember*: a link that opens a tab cannot ship without
 * announcing that it does.
 * @see WCAG 3.2.5 (Change on Request), and {@link ExternalLinkHint} for the wording itself.
 *
 * Used only for links that genuinely leave the app. In-app navigation uses `next/link`, which neither opens a tab nor
 * needs any of this — see `MemberCard` and `BillCard`.
 *
 * @param props - @see OutboundLinkProps
 * @returns The anchor, with the glyph and the hidden hint already in place after the link text.
 */
export function OutboundLink({
  href,
  children,
  className = "text-link",
  iconSize = 15,
}: OutboundLinkProps): JSX.Element {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children} <ExternalLink aria-hidden="true" size={iconSize} />
      <ExternalLinkHint />
    </a>
  );
}
