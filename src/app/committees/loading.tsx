import type { JSX } from "react";

import { FacetedDirectorySkeleton } from "@/components/faceted-directory-skeleton";

/** The directory's second control row: committee type and sort — one fewer than the member directory's. */
const SKELETON_FACET_COUNT: number = 2;

/**
 * Streamed by Next while the committee list resolves.
 *
 * @returns The faceted directory skeleton, sized to this route's controls and grid.
 */
export default function CommitteesLoading(): JSX.Element {
  return (
    <FacetedDirectorySkeleton
      facetCount={SKELETON_FACET_COUNT}
      gridClassName="committee-grid"
      status="Loading Committees…"
    />
  );
}
