import type { JSX } from "react";

import { PageHeader } from "@/components/page-header";
import { SiteShell } from "@/components/site-shell";

/** Streamed by Next while the /bills route's async data fetch resolves. Purely decorative — no real data. */
export default function BillsLoading(): JSX.Element {
  return (
    <SiteShell>
      <PageHeader
        description="Search the Current Feed, Then Follow Each Record Back to Its Official Congress.gov Source."
        eyebrow="Legislation"
        title="Start With the Record."
      />
      <div className="skeleton-controls" aria-hidden="true">
        <div className="skeleton skeleton--search" />
        <div className="skeleton skeleton--filters" />
      </div>
      <div className="directory-grid" aria-hidden="true">
        {Array.from({ length: 6 }).map(
          // Static, fixed-length placeholder grid that never reorders — index-as-key is safe here.
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
