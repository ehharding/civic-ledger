import type { JSX } from "react";

import { SiteShell } from "@/components/site-shell";

/** Fixed-length placeholder grid that never reorders — index-as-key is safe here. */
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
      <div className="activity-grid" aria-hidden="true">
        {Array.from({ length: SKELETON_CARD_COUNT }).map(
          (_: unknown, index: number): JSX.Element => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton grid, never reorders
            <div className="skeleton skeleton--card" key={index} />
          ),
        )}
      </div>
      <span className="sr-only" role="status">
        Loading Member…
      </span>
    </SiteShell>
  );
}
