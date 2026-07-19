import type { JSX } from "react";

import { SiteShell } from "@/components/site-shell";

/** Streamed by Next while the bill detail route's getBillById/getCongressSnapshot calls resolve. */
export default function BillDetailLoading(): JSX.Element {
  return (
    <SiteShell>
      <div className="skeleton-detail" aria-hidden="true">
        <div className="skeleton skeleton--eyebrow" />
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--meta" />
        <div className="skeleton skeleton--panel" />
      </div>
      <span className="sr-only" role="status">
        Loading Bill Record…
      </span>
    </SiteShell>
  );
}
