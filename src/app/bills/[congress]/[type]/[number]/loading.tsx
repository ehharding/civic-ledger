import type { JSX } from "react";

import { SiteShell } from "@/components/site-shell";
import { LoadingStatus } from "@/components/skeleton";

/**
 * Streamed by Next while the bill detail route's lookup resolves.
 *
 * @returns The record skeleton and its screen-reader status message.
 */
export default function BillDetailLoading(): JSX.Element {
  return (
    <SiteShell>
      <div className="skeleton-detail" aria-hidden="true">
        <div className="skeleton skeleton--eyebrow" />
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--meta" />
        <div className="skeleton skeleton--panel" />
      </div>
      <LoadingStatus>Loading Bill Record…</LoadingStatus>
    </SiteShell>
  );
}
