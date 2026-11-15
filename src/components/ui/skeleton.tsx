import type { JSX, ReactNode } from "react";

/**
 * The placeholder primitives every `loading.tsx` route is built from. Each route mirrors its own page's shape, but the
 * patterns — especially the accessibility-bearing ones — are shared here.
 */

/**
 * The eyebrow / title / lead-paragraph trio every page opens with, drawn as blank blocks. Not a real `<h1>`: loading UI
 * doesn't know the title, so the group is `aria-hidden` and paired with a {@link LoadingStatus}.
 *
 * @param children - Extra placeholder blocks that belong inside the same header group, e.g., the bill record's summary
 *   panel. Most callers pass none.
 * @returns The header placeholder, hidden from assistive technology.
 */
export function SkeletonPageHeader({ children }: { children?: ReactNode }): JSX.Element {
  return (
    <div className="skeleton-detail" aria-hidden="true">
      <div className="skeleton skeleton--eyebrow" />
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--meta" />
      {children}
    </div>
  );
}

/**
 * The search field and segmented filter row every directory opens with, drawn as blank blocks.
 *
 * @returns The control-row placeholder, hidden from assistive technology.
 */
export function SkeletonControls(): JSX.Element {
  return (
    <div className="skeleton-controls" aria-hidden="true">
      <div className="skeleton skeleton--search" />
      <div className="skeleton skeleton--filters" />
    </div>
  );
}

/** Props for {@link SkeletonGrid}. */
type SkeletonGridProps = {
  /** How many placeholder blocks to draw. */
  count: number;
  /** The grid the blocks sit in — usually the real page's own grid class, so the columns match. */
  className: string;
  /** The block class, which carries each placeholder's size. */
  blockClassName: string;
};

/**
 * A fixed-length grid of placeholder blocks, `aria-hidden` (the route's {@link LoadingStatus} speaks for it). Index
 * keys are safe: the blocks are identical and never reorder.
 *
 * @param props - @see SkeletonGridProps
 * @returns The placeholder grid, hidden from assistive technology.
 */
export function SkeletonGrid({ count, className, blockClassName }: SkeletonGridProps): JSX.Element {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: count }).map(
        (_: unknown, index: number): JSX.Element => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton grid, never reorders
          <div className={blockClassName} key={index} />
        ),
      )}
    </div>
  );
}

/**
 * The one thing a skeleton says out loud: a visually hidden, polite `role="status"` message.
 *
 * @param children - The message, e.g., `"Loading Bills…"`.
 * @returns The screen-reader-only status message.
 */
export function LoadingStatus({ children }: { children: string }): JSX.Element {
  return (
    <span className="sr-only" role="status">
      {children}
    </span>
  );
}
