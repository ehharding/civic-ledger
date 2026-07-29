import type { JSX } from "react";

/**
 * The placeholder primitives the four `loading.tsx` routes are built from.
 *
 * Each of those routes mirrors the shape of the page it stands in for, so they can't share a single skeleton
 * *component* — but they were each hand-rolling the same two patterns, and both are easy to get subtly wrong in a way
 * nobody notices until someone uses a screen reader.
 */

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
 * A fixed-length row or grid of placeholder blocks.
 *
 * Marked `aria-hidden` as a whole: a screen reader has nothing to gain from a dozen empty boxes, and every route that
 * renders one of these pairs it with a {@link LoadingStatus} that says the same thing in one short sentence instead.
 *
 * The index-as-key suppression lives here rather than at each of the four call sites that used to carry its own copy.
 * It is sound for exactly the reason the name says: the array is a fixed length of identical, contentless blocks that
 * never reorders, so there is no identity for a key to preserve.
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
 * The one thing a skeleton actually says out loud.
 *
 * `role="status"` rather than `aria-live="assertive"` deliberately: a page that is merely still loading is not worth
 * interrupting whatever is currently being read. Visually hidden because the placeholder blocks already convey the
 * same thing to anyone who can see them.
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
