import type { JSX } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { SiteShell } from "@/components/layout/site-shell";
import { LoadingStatus, SkeletonControls, SkeletonGrid } from "@/components/ui/skeleton";

/** Matches the first page the real directory renders, so the grid doesn't change length when content arrives. */
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
      <SkeletonControls />
      <SkeletonGrid blockClassName="skeleton skeleton--card" className="directory-grid" count={SKELETON_CARD_COUNT} />
      <LoadingStatus>Loading Bills…</LoadingStatus>
    </SiteShell>
  );
}
