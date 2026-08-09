"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  type CSSProperties,
  type JSX,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import type { GlossaryTerm } from "@/lib/glossary";

/** How close to an edge of the viewport the bubble is allowed to sit, in pixels. */
const VIEWPORT_MARGIN: number = 8;

/** Where the bubble ends up once it has been held inside the viewport. @see fitTipToViewport */
export type TipPlacement = {
  /** The `left` offset to apply, against a bubble whose own transform pulls it back by half its width. */
  left: string;
  /** Which side of the term the bubble sits on. Above by default; below only when there is no room above. */
  side: "above" | "below";
};

/** A bubble centered over its term with nothing overriding it — the placement every measurement starts from. */
export const DEFAULT_TIP_PLACEMENT: TipPlacement = { left: "50%", side: "above" };

/**
 * Holds a measured bubble inside the viewport.
 *
 * Centering a bubble on the word it defines is right until the word is near an edge, and in this app it very often is:
 * a lesson's text column is narrower than the window, so the *first* word of a line sits far enough left that a 23rem
 * bubble centered on it starts off-screen. Pure CSS cannot express "centered, but not past the edge" — `position:
 * absolute` resolves against an ancestor, and the ancestor is the word — so the correction is measured once per
 * opening and applied as an offset.
 *
 * Kept as a pure function of two rectangles, with no DOM access of its own, so every case it has to get right — off the
 * left, off the right, off the top, and the ordinary centered one — is directly testable rather than reachable only by
 * rendering a page at a particular width. Same reasoning as `seating.ts`, one layer down.
 *
 * @param box - Where the bubble landed when centered and placed above, in viewport coordinates.
 * @param viewport - The visible area's width. Only the width is consulted: the vertical decision is whether the bubble
 *   is clipped at the *top*, which its own rectangle already answers.
 * @returns The placement to render with. Horizontal correction is applied to whichever edge overhangs; a bubble wider
 *   than the viewport itself is pinned to the leading edge, since it cannot satisfy both.
 */
export function fitTipToViewport(box: DOMRect, viewport: { width: number }): TipPlacement {
  const overhangLeft: number = VIEWPORT_MARGIN - box.left;
  const overhangRight: number = box.right - (viewport.width - VIEWPORT_MARGIN);
  const shift: number = overhangLeft > 0 ? overhangLeft : overhangRight > 0 ? -overhangRight : 0;

  return {
    left: shift === 0 ? DEFAULT_TIP_PLACEMENT.left : `calc(50% + ${Math.round(shift)}px)`,
    // A term high enough in the viewport that its bubble would be cut off at the top gets the bubble underneath
    // instead. There is no matching flip for the bottom edge: a term near the bottom is one a reader can scroll past,
    // while a term under the header has nothing above it to reveal.
    side: box.top < VIEWPORT_MARGIN ? "below" : "above",
  };
}

/** Props for {@link GlossaryTermTip}. */
type GlossaryTermTipProps = {
  /** The entry to define. Passed in whole rather than looked up here, so the browser bundle carries only the terms a
   *  page actually uses instead of the entire glossary. */
  entry: GlossaryTerm;
  /** Where the term links, which is always its own entry on `/learn`. @see glossaryHref */
  href: Route;
  /** The term as it appeared in the source text — its own casing and inflection, never the entry's spelling. */
  children: ReactNode;
};

/**
 * A word in the app's prose that carries its own definition.
 *
 * The half of the glossary that comes to the reader rather than waiting on `/learn` to be visited: someone who meets
 * "markup" or "cloture" in a lesson or in a bill's latest action gets the definition where they met the word, without
 * losing their place in what they were reading.
 *
 * **It is a link first and a tooltip second, and that order is the design.** The visible term is an anchor to its own
 * entry on `/learn`, so the feature still works with JavaScript off, on a touch screen where there is no hover, and for
 * anyone who wants the full entry rather than a passing glance. The hover-and-focus bubble is an enhancement layered on
 * top of a control that already did something.
 *
 * Four things WCAG 1.4.13 (Content on Hover or Focus) asks of a bubble like this, and where each one is:
 *
 * - **Reachable without a pointer.** The trigger is a real link, so it takes focus in the tab order and the bubble
 *   opens on focus exactly as it does on hover.
 * - **Hoverable.** The listeners sit on the wrapper, which contains the bubble, so moving the pointer off the word and
 *   into the definition does not dismiss the thing being read.
 * - **Dismissible.** Escape closes it, listened for on the document rather than on the trigger — a bubble opened by
 *   hovering is one the keyboard has no focus inside, so a handler on the link would never hear the keypress.
 * - **Persistent.** Nothing closes on a timer.
 *
 * The bubble stays in the DOM whether or not it is showing, and `aria-describedby` always points at it. That is not an
 * oversight: a screen reader announces a description at the moment focus arrives, and a bubble mounted by a state
 * update lands *after* that moment. Keeping it mounted and hiding it in CSS means the definition is announced on focus
 * regardless of what the visual state has caught up to.
 *
 * The pointer listeners sit on the outer `<span>` rather than on the link, which is what the lint suppression below is
 * about. They have to: the wrapper is what also contains the bubble, so listening on the link would fire a leave the
 * instant the pointer crossed from the word into the definition it opened — the "hoverable" requirement above, failed.
 * The wrapper is a positioning box with no behavior of its own, and every affordance a person actually operates
 * (focus, activation, the accessible name) belongs to the real link inside it.
 *
 * @param props - @see GlossaryTermTipProps
 * @returns The linked term and its definition bubble.
 */
export function GlossaryTermTip({ entry, href, children }: GlossaryTermTipProps): JSX.Element {
  const tipId: string = useId();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [placement, setPlacement] = useState<TipPlacement>(DEFAULT_TIP_PLACEMENT);
  const tipRef: RefObject<HTMLSpanElement | null> = useRef<HTMLSpanElement | null>(null);

  useEffect((): (() => void) | undefined => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return (): void => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  /**
   * Measures the bubble each time it opens and corrects it back inside the viewport.
   *
   * Measured on opening rather than on mount because a page can carry dozens of these and only ever show one at a time
   * — laying them all out up front would be tens of forced reflows to position something nobody looked at. Resetting on
   * close is what keeps the *next* measurement honest: the correction is expressed against a centered bubble, so
   * measuring an already-corrected one would compound the offset.
   */
  useEffect((): void => {
    if (!isOpen) {
      setPlacement(DEFAULT_TIP_PLACEMENT);
      return;
    }

    const tip: HTMLSpanElement | null = tipRef.current;
    /* v8 ignore start -- the bubble is rendered unconditionally, so its ref is always set by the time an effect runs. */
    if (!tip) return;
    /* v8 ignore stop */

    setPlacement(fitTipToViewport(tip.getBoundingClientRect(), { width: document.documentElement.clientWidth }));
  }, [isOpen]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the link inside is the control; @see the doc comment above.
    <span
      className="glossary-term"
      onBlur={(): void => setIsOpen(false)}
      onFocus={(): void => setIsOpen(true)}
      onMouseEnter={(): void => setIsOpen(true)}
      onMouseLeave={(): void => setIsOpen(false)}
    >
      <Link aria-describedby={tipId} className="glossary-term__word" href={href}>
        {children}
      </Link>
      <span
        className="glossary-term__tip"
        data-open={isOpen ? "true" : "false"}
        data-side={placement.side}
        id={tipId}
        ref={tipRef}
        role="tooltip"
        style={{ left: placement.left } satisfies CSSProperties}
      >
        <span className="glossary-term__tip-name">{entry.term}</span>
        <span className="glossary-term__tip-plain">{entry.plainEnglish}</span>
        <span className="glossary-term__tip-detail">{entry.detail}</span>
      </span>
    </span>
  );
}
