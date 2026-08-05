import type { JSX } from "react";

import { SiteShell } from "@/components/site-shell";
import { LoadingStatus, SkeletonControls, SkeletonGrid, SkeletonPageHeader } from "@/components/skeleton";

/** Roughly a screenful of the real grid, so the page doesn't grow noticeably when content arrives. */
const SKELETON_CARD_COUNT: number = 9;

/** Props for {@link FacetedDirectorySkeleton}. */
type FacetedDirectorySkeletonProps = {
  /** How many controls sit in the directory's second row — three for members, two for committees. */
  facetCount: number;
  /** The real page's own grid class, so the placeholder columns match the ones content lands in. */
  gridClassName: string;
  /** The one sentence this route announces, e.g., `"Loading Members…"`. */
  status: string;
};

/**
 * Loading skeleton shared by the two faceted directory routes, `/members` and `/committees`.
 *
 * Both mirror the same shape — header copy, the search-and-chamber row, the facet row, then the card grid — because
 * both real pages are assembled from the same controls (@see directory-controls.tsx). They differ only in how many
 * facets sit in that second row, which grid the cards land in, and what the page is called, so that is all this takes.
 *
 * Neither route can know its heading before the data lands, so the header is drawn as blank blocks. Those, and every
 * other placeholder here, are `aria-hidden` and paired with one live status message, so assistive technology hears
 * "Loading Members…" once rather than being read a wall of empty boxes.
 *
 * @param props - @see FacetedDirectorySkeletonProps
 * @returns The directory skeleton and its screen-reader status message.
 */
export function FacetedDirectorySkeleton({
  facetCount,
  gridClassName,
  status,
}: FacetedDirectorySkeletonProps): JSX.Element {
  return (
    <SiteShell>
      <SkeletonPageHeader />
      <SkeletonControls />
      <SkeletonGrid blockClassName="skeleton skeleton--facet" className="skeleton-facets" count={facetCount} />
      <SkeletonGrid
        blockClassName="skeleton skeleton--member-card"
        className={gridClassName}
        count={SKELETON_CARD_COUNT}
      />
      <LoadingStatus>{status}</LoadingStatus>
    </SiteShell>
  );
}
