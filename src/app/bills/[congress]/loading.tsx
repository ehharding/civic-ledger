import type { JSX } from "react";

import { BillDirectorySkeleton } from "@/components/bill-directory-skeleton";

/**
 * Streamed by Next while a /bills/[congress] route's snapshot fetch resolves. Purely decorative — no real data, and
 * generic rather than naming the requested Congress, since Loading UI doesn't receive the route's params.
 */
export default function CongressBillsLoading(): JSX.Element {
  return (
    <BillDirectorySkeleton
      description="Search this Congress's bills, then follow each record back to its official Congress.gov source."
      eyebrow="Legislation"
      title="Loading This Congress…"
    />
  );
}
