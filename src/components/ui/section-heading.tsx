import type { JSX, ReactNode } from "react";

/**
 * The kicker-and-heading row that opens a page section: the `.section-heading` block, with room for one trailing
 * action. The sibling of {@link DetailPanel} for a section whose content sits outside a panel.
 */

/** Which element a heading row renders as. */
type SectionHeadingElement = "div" | "section";

/** Props for {@link SectionHeading}. */
type SectionHeadingProps = {
  /** The small label above the heading, e.g., `"Latest Activity"`. */
  kicker: string;
  /** The section's heading, rendered as an `<h2>`. */
  heading: string;
  /** The heading's `id`, for the enclosing section's `aria-labelledby` (or this row's own, when it is a section). */
  headingId: string;
  /**
   * `"div"` (the default) when an enclosing `<section>` is already labeled by this heading; `"section"` when the row
   * stands as a landmark of its own, in which case it labels itself with `headingId`.
   */
  as?: SectionHeadingElement;
  /** Extra classes, for the rare row that tunes its own spacing. */
  className?: string;
  /** A trailing action beside the heading, e.g., a "Browse All" link. */
  children?: ReactNode;
};

/**
 * One section heading row.
 *
 * @param props - {@link SectionHeadingProps}.
 * @returns The kicker and `<h2>`, followed by the trailing action if there is one.
 */
export function SectionHeading({
  kicker,
  heading,
  headingId,
  as: Element = "div",
  className,
  children,
}: SectionHeadingProps): JSX.Element {
  return (
    <Element
      aria-labelledby={Element === "section" ? headingId : undefined}
      className={className ? `section-heading ${className}` : "section-heading"}
    >
      <div>
        <p className="section-kicker">{kicker}</p>
        <h2 id={headingId}>{heading}</h2>
      </div>
      {children}
    </Element>
  );
}
