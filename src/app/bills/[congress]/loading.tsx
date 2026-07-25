import type { JSX } from "react";

import { PageHeader } from "@/components/page-header";
import { SiteShell } from "@/components/site-shell";

/**
 * Streamed by Next while a /bills/[congress] route's snapshot fetch resolves. Purely decorative — no real data, and
 * generic rather than naming the requested Congress, since Loading UI doesn't receive the route's params.
 */
export default function CongressBillsLoading(): JSX.Element {
  return (
    <SiteShell>
      <PageHeader
        eyebrow="Legislation"
        title="Loading This Congress…"
        description="Search this Congress's bills, then follow each record back to its official Congress.gov source."
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
