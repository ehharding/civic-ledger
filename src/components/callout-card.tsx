import type { LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { JSX, ReactNode } from "react";

/**
 * How much room the callout leaves above itself.
 *
 * The gap belongs to the callout rather than to the page because what sits above it differs by route, and every one of
 * those sections ends with no bottom margin of its own. Naming the two cases here keeps that decision at the call site,
 * where the surrounding content is visible, rather than buried in a stylesheet.
 *
 * Two cases, and there is deliberately no third that zeroes the gap: no section this panel follows supplies one. A
 * grid's `gap` in particular sits *between* its rows and adds nothing below the last, so the glossary grid ends flush
 * with its final card.
 *
 * - `default` — follows content that supplies no gap (a detail grid, the glossary grid, the lesson steps).
 * - `spacious` — follows the home page's activity grid, whose rhythm is more generous than the rest of the app's.
 */
export type CalloutSpacing = "default" | "spacious";

const SPACING_CLASSES: Readonly<Record<CalloutSpacing, string>> = {
  default: "reading-card",
  spacious: "reading-card reading-card--spacious",
};

/** Props for {@link CalloutCard}. */
type CalloutCardProps = {
  /** The decorative icon in the round badge. Rendered `aria-hidden` — the heading carries the meaning. */
  icon: LucideIcon;
  /** The small caps label above the heading (e.g., "Read It With Context"). */
  kicker: string;
  /** The callout's heading. */
  heading: string;
  /**
   * Ties the `<section>` to its own heading via `aria-labelledby`, so the landmark is announced by name rather than as
   * an unlabeled region. Must be unique within the page.
   */
  headingId: string;
  /** The explanatory paragraph under the heading. */
  body: ReactNode;
  /** Where the trailing call to action goes. */
  href: Route;
  /** The call to action's text. */
  linkLabel: string;
  /** The call to action's trailing icon — an outward arrow for a new topic, a rightward one for the next step. */
  linkIcon: LucideIcon;
  /** @see CalloutSpacing. Defaults to `"default"`. */
  spacing?: CalloutSpacing;
};

/**
 * The warm "read this next" panel that closes a page.
 *
 * Six routes end with one of these — all three detail pages, both learn pages, and the home page — differing only in
 * their copy and their two icons. Spelled out per route, that would be six places to keep a decorative icon
 * `aria-hidden`, six to get the `aria-labelledby` wiring right, and six to update when the shape changes, which is
 * exactly the arrangement in which one page's icon quietly ends up a pixel larger than the rest.
 *
 * The panel is deliberately *not* a link itself. Each one wraps a heading and a paragraph around a single call to
 * action, and a link containing a heading gives assistive technology a long, unwieldy accessible name for what is
 * really one short destination.
 *
 * @param props - @see CalloutCardProps
 * @returns The callout section: badge icon, kicker, heading, body, and the call to action.
 */
export function CalloutCard({
  icon: Icon,
  kicker,
  heading,
  headingId,
  body,
  href,
  linkLabel,
  linkIcon: LinkIcon,
  spacing = "default",
}: CalloutCardProps): JSX.Element {
  return (
    <section className={SPACING_CLASSES[spacing]} aria-labelledby={headingId}>
      <div className="reading-card__icon">
        <Icon aria-hidden="true" size={22} />
      </div>
      <div>
        <p className="section-kicker">{kicker}</p>
        <h2 id={headingId}>{heading}</h2>
        <p>{body}</p>
      </div>
      <Link href={href} className="secondary-link">
        {linkLabel} <LinkIcon aria-hidden="true" size={16} />
      </Link>
    </section>
  );
}
