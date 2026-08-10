import type { JSX } from "react";

import { BillDirectorySkeleton } from "@/components/bills/bill-directory-skeleton";

/**
 * Streamed by Next while the `/bills` route's snapshot fetch resolves.
 *
 * Copy is duplicated from the route rather than shared, deliberately: matching it exactly is what makes the skeleton
 * resolve into the real page without anything shifting.
 *
 * @returns The directory skeleton with this route's header copy.
 */
export default function BillsLoading(): JSX.Element {
  return (
    <BillDirectorySkeleton
      description="Search the current Congress's bills, then follow each record back to its official Congress.gov source."
      eyebrow="Legislation"
      title="Start With the Record."
    />
  );
}
