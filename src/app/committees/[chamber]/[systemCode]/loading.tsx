import type { JSX } from "react";

import { SiteShell } from "@/components/site-shell";
import { LoadingStatus } from "@/components/skeleton";

/**
 * Streamed by Next while a committee's record resolves.
 *
 * Mirrors the real page's shape — the hero's eyebrow, name, and lead paragraph, then the two detail panels — so the
 * skeleton resolves into the page without anything jumping. Deliberately not a `SkeletonGrid`: this page's placeholder
 * blocks aren't a repeating row of identical cards, they're two panels of different heights, and drawing them as a grid
 * would settle into a layout the real page never takes.
 *
 * @returns The committee skeleton.
 */
export default function CommitteeLoading(): JSX.Element {
  return (
    <SiteShell>
      <div className="skeleton-detail" aria-hidden="true">
        <div className="skeleton skeleton--eyebrow" />
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--meta" />
      </div>
      <div className="detail-grid" aria-hidden="true">
        <div className="skeleton skeleton--panel" />
        <div className="skeleton skeleton--panel" />
      </div>
      <LoadingStatus>Loading Committee…</LoadingStatus>
    </SiteShell>
  );
}
