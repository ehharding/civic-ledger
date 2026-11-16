import { ExternalLink } from "lucide-react";
import type { JSX, ReactNode } from "react";

import { ExternalLinkHint } from "@/components/ui/external-link-hint";

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
 * A link that leaves this app for a primary source. In-app navigation uses `next/link` instead.
 *
 * Composes the four things every outbound link owes a reader, so none can be forgotten at a call site:
 * `target="_blank"` to keep their place, `rel="noreferrer"` so the destination learns nothing, a visible leaving glyph,
 * and — since that glyph is `aria-hidden` — the audible {@link ExternalLinkHint} that a new tab is opening.
 *
 * @param props - {@link OutboundLinkProps}.
 * @returns The anchor, with the glyph and the hidden hint already in place after the link text.
 * @see WCAG 3.2.5 (Change on Request), and {@link ExternalLinkHint} for the wording itself.
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
