import type { JSX } from "react";

import { PageHeader } from "@/components/page-header";
import { SiteShell } from "@/components/site-shell";

/** Fixed-length placeholder grid that never reorders — index-as-key is safe here. */
const SKELETON_CARD_COUNT: number = 6;

/**
 * Loading skeleton shared by both bill-directory routes (`/bills` and `/bills/[congress]`), which are streamed by Next
 * while their respective snapshot fetch resolves and differ only in their PageHeader copy. Purely decorative — no real
 * data.
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
