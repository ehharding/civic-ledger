import type { JSX } from "react";

import { PageHeader } from "@/components/page-header";
import { SiteShell } from "@/components/site-shell";

/** Fixed-length placeholder grid that never reorders — index-as-key is safe here. */
const SKELETON_CARD_COUNT: number = 6;

/**
 * Loading skeleton shared by both bill-directory routes, streamed by Next while their snapshot fetch resolves.
 *
 * The two routes differ only in their header copy, so that's all this takes as props. The placeholder blocks are
 * `aria-hidden` and paired with a live status message, so assistive technology hears "Loading Bills…" once rather than
 * being read a grid of empty boxes.
 *
 * @param eyebrow - Matches the real page's eyebrow, so nothing shifts when content arrives.
 * @param title - Matches the real page's title.
 * @param description - Matches the real page's description.
 * @returns The skeleton grid and its screen-reader status message.
 */
export function BillDirectorySkeleton({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}): JSX.Element {
  return (
    <SiteShell>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="skeleton-controls" aria-hidden="true">
        <div className="skeleton skeleton--search" />
        <div className="skeleton skeleton--filters" />
      </div>
      <div className="directory-grid" aria-hidden="true">
        {Array.from({ length: SKELETON_CARD_COUNT }).map(
          (_: unknown, index: number): JSX.Element => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton grid, never reorders
            <div className="skeleton skeleton--card" key={index} />
          ),
        )}
      </div>
      <span className="sr-only" role="status">
        Loading Bills…
      </span>
    </SiteShell>
  );
}
