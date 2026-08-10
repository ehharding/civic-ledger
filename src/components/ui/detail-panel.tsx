import type { JSX, ReactNode } from "react";

/**
 * The panel every record page's sections are built from: a small kicker, the heading under it, and whatever that
 * section holds.
 *
 * The bill, member, and committee pages and the lesson body are the same document in four subjects — a stack of labeled
 * panels, two to a row — and this is where they say so. The argument is the one `directory-controls.tsx` already makes
 * for the three directories' controls: a sameness held structurally is a sameness that cannot drift.
 *
 * **The `aria-labelledby` pairing is worth more than the six lines of markup.** A panel names itself to assistive
 * technology by pointing an attribute at an id, and spelled out by hand those are two independent strings a line apart:
 * rename the heading's id and the labeled region points at nothing, while the page still looks exactly right and every
 * visual check still passes. Here `headingId` is written once and used at both ends, so they cannot disagree.
 * `tests/e2e/accessibility.spec.ts` is what catches it if some other panel ever spells the pair out again.
 */

/**
 * Which element a panel renders as.
 *
 * All three are `.detail-panel` and look identical; the choice is about what the panel *is*. `"section"` is the default
 * and the common case. `"aside"` is the secondary panel of a two-panel row — the latest action beside the journey, the
 * primary-source links beside the record — content that supports the row's main panel rather than continuing it.
 * `"article"` is a lesson step, which is self-contained enough to stand on its own.
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
   * whole point — @see DetailPanel. Must be unique within the page.
   */
  headingId: string;
  /** @see DetailPanelElement. Defaults to `"section"`. */
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
 * @param props - @see DetailPanelProps
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
