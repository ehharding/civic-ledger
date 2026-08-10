import type { JSX } from "react";

import { SiteShell } from "@/components/layout/site-shell";
import { LoadingStatus, SkeletonPageHeader } from "@/components/ui/skeleton";

/**
 * Streamed by Next while the bill detail route's lookup resolves.
 *
 * @returns The record skeleton and its screen-reader status message.
 */
export default function BillDetailLoading(): JSX.Element {
  return (
    <SiteShell>
      <SkeletonPageHeader>
        <div className="skeleton skeleton--panel" />
      </SkeletonPageHeader>
      <LoadingStatus>Loading Bill Record…</LoadingStatus>
    </SiteShell>
  );
}
