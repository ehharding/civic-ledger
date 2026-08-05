import type { JSX, ReactNode } from "react";

/**
 * The placeholder primitives every `loading.tsx` route is built from — seven of them now, across the bill, member, and
 * committee halves of the app.
 *
 * Each of those routes mirrors the shape of the page it stands in for, so they can't share a single skeleton
 * *component* — but they were each hand-rolling the same handful of patterns, and the two accessibility-bearing ones
 * are easy to get subtly wrong in a way nobody notices until someone uses a screen reader.
 */

/**
 * The eyebrow / title / lead-paragraph trio every page opens with, drawn as blank blocks.
 *
 * Blocks rather than a real `<h1>`: a route's loading UI receives no params, so it cannot know the title it is standing
 * in for, and a placeholder heading would be announced and then replaced — worse than one arriving once. The whole
 * group is `aria-hidden`, and each route pairs it with a {@link LoadingStatus} instead.
 *
 * @param children - Extra placeholder blocks that belong inside the same header group, e.g. the bill record's summary
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
 * Shared by all three directory skeletons because all three real directories open with the same pair — @see
 * DirectorySearch and SegmentedFilter, which `directory-controls.tsx` shares for the same reason.
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
 * A fixed-length row or grid of placeholder blocks.
 *
 * Marked `aria-hidden` as a whole: a screen reader has nothing to gain from a dozen empty boxes, and every route that
 * renders one of these pairs it with a {@link LoadingStatus} that says the same thing in one short sentence instead.
 *
 * The index-as-key suppression lives here rather than at every call site that would otherwise carry its own copy. It is
 * sound for exactly the reason the name says: the array is a fixed length of identical, contentless blocks that never
 * reorders, so there is no identity for a key to preserve.
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
 * interrupting whatever is currently being read. Visually hidden because the placeholder blocks already convey the same
 * thing to anyone who can see them.
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
