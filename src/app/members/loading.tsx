import type { JSX } from "react";

import { SiteShell } from "@/components/site-shell";
import { LoadingStatus, SkeletonGrid } from "@/components/skeleton";

/** Roughly a screenful of the real roster, so the page doesn't grow noticeably when content arrives. */
const SKELETON_CARD_COUNT: number = 9;

/** The directory's second control row: party, jurisdiction, and sort. */
const SKELETON_FACET_COUNT: number = 3;

/**
 * Streamed by Next while the member directory's roster resolves.
 *
 * Mirrors the real page's shape — header copy, the search-and-chamber row, the facet row, then the card grid — so the
 * skeleton resolves into the page without anything jumping. The placeholder blocks are `aria-hidden` and paired with a
 * live status message, so assistive technology hears "Loading Members…" once rather than being read a wall of empty
 * boxes.
 *
 * @returns The directory skeleton.
 */
export default function MembersLoading(): JSX.Element {
  return (
    <SiteShell>
      <div className="skeleton-detail" aria-hidden="true">
        <div className="skeleton skeleton--eyebrow" />
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--meta" />
      </div>
      <div className="skeleton-controls" aria-hidden="true">
        <div className="skeleton skeleton--search" />
        <div className="skeleton skeleton--filters" />
      </div>
      <SkeletonGrid
        blockClassName="skeleton skeleton--facet"
        className="skeleton-facets"
        count={SKELETON_FACET_COUNT}
      />
      <SkeletonGrid
        blockClassName="skeleton skeleton--member-card"
        className="member-grid"
        count={SKELETON_CARD_COUNT}
      />
      <LoadingStatus>Loading Members…</LoadingStatus>
    </SiteShell>
  );
}
