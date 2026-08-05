import type { JSX } from "react";

import { FacetedDirectorySkeleton } from "@/components/faceted-directory-skeleton";

/** The directory's second control row: party, jurisdiction, and sort. */
const SKELETON_FACET_COUNT: number = 3;

/**
 * Streamed by Next while the member directory's roster resolves.
 *
 * @returns The faceted directory skeleton, sized to this route's controls and grid.
 */
export default function MembersLoading(): JSX.Element {
  return (
    <FacetedDirectorySkeleton facetCount={SKELETON_FACET_COUNT} gridClassName="member-grid" status="Loading Members…" />
  );
}
