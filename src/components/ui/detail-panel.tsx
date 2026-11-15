import type { JSX, ReactNode } from "react";

/**
 * The panel every record and lesson page's sections are built from: a kicker, a heading, and the section's content.
 * `headingId` feeds both the heading's `id` and the panel's `aria-labelledby`, so the pair can't drift apart.
 */

/**
 * Which element a panel renders as; all look identical. `"section"` is the default, `"aside"` a supporting panel beside
 * a row's main one, and `"article"` a self-contained lesson step.
 */
type DetailPanelElement = "section" | "aside" | "article";

/** Props for {@link DetailPanel}. */
type DetailPanelProps = {
  /** The small label above the heading, e.g., `"Primary Source"`. A node rather than a string so a lesson step can
   *  count itself ("Step 2 of 5") without assembling the sentence first. */
  kicker: ReactNode;
  /** The panel's heading. */
  heading: string;
  /**
   * The heading's `id`, which is also what this panel's `aria-labelledby` points at. One value for both, which is the
   * whole point. Must be unique within the page.
   *
   * @see DetailPanel
   */
  headingId: string;
  /** The element the panel renders as, as a {@link DetailPanelElement}. Defaults to `"section"`. */
  as?: DetailPanelElement;
  /** The accent surface, for a panel that should read as a distinct kind of thing from the one beside it. */
  accent?: boolean;
  /** Extra classes, for the handful of panels that tune their own layout (`lesson-step`, `lesson-limits`). */
  className?: string;
  /** The panel's contents, rendered directly under the heading — `.detail-panel > .text-link` in the stylesheet
   *  depends on there being no wrapper here. */
  children: ReactNode;
};

/**
 * One labeled panel on a record or lesson page.
 *
 * @param props - {@link DetailPanelProps}.
 * @returns The panel, labeled by its own heading.
 */
export function DetailPanel({
  kicker,
  heading,
  headingId,
  as: Element = "section",
  accent = false,
  className,
  children,
}: DetailPanelProps): JSX.Element {
  const classes: string[] = ["detail-panel"];
  if (accent) classes.push("detail-panel--accent");
  if (className) classes.push(className);

  return (
    <Element aria-labelledby={headingId} className={classes.join(" ")}>
      <p className="section-kicker">{kicker}</p>
      <h2 id={headingId}>{heading}</h2>
      {children}
    </Element>
  );
}
