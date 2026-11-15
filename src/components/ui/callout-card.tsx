import type { LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { JSX, ReactNode } from "react";

/**
 * How much room the callout leaves above itself — chosen at the call site, since the preceding sections supply no
 * bottom margin.
 *
 * - `default` — after a detail grid, the glossary grid, or the lesson steps.
 * - `spacious` — after the home page's more generously spaced activity grid.
 */
export type CalloutSpacing = "default" | "spacious";

/** The class list each {@link CalloutSpacing} resolves to. */
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
  /** How much room the callout leaves above itself. Defaults to `"default"`. */
  spacing?: CalloutSpacing;
};

/**
 * The "read this next" panel that closes six pages. Not a link itself: a link wrapping a heading gets an unwieldy
 * accessible name, so the call to action is its own link.
 *
 * @param props - {@link CalloutCardProps}.
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
