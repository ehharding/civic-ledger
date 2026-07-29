import type { JSX } from "react";

import { SiteShell } from "@/components/site-shell";
import { LoadingStatus, SkeletonGrid } from "@/components/skeleton";

/** The member page shows a capped number of sponsored bills; this matches that cap. */
const SKELETON_CARD_COUNT: number = 3;

/**
 * Streamed by Next while the member route's three fetches resolve.
 *
 * Mirrors the real page's shape — portrait block, hero copy, one card grid — so the skeleton resolves into the page
 * without anything jumping. The placeholder blocks are `aria-hidden` and paired with a live status message, so
 * assistive technology hears "Loading Member…" once rather than being read a wall of empty boxes.
 *
 * @returns The member skeleton.
 */
export default function MemberLoading(): JSX.Element {
  return (
    <SiteShell>
      <div className="member-hero" aria-hidden="true">
        <div className="skeleton skeleton--portrait" />
        <div className="member-hero__copy">
          <div className="skeleton skeleton--line skeleton--line-short" />
          <div className="skeleton skeleton--line skeleton--line-title" />
          <div className="skeleton skeleton--line" />
        </div>
      </div>
      <SkeletonGrid blockClassName="skeleton skeleton--card" className="activity-grid" count={SKELETON_CARD_COUNT} />
      <LoadingStatus>Loading Member…</LoadingStatus>
    </SiteShell>
  );
}
