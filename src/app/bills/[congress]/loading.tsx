import type { JSX } from "react";

import { BillDirectorySkeleton } from "@/components/bill-directory-skeleton";

/**
 * Streamed by Next while a `/bills/[congress]` route's snapshot fetch resolves.
 *
 * Worded generically rather than naming the requested Congress: Next's loading UI doesn't receive route params, and a
 * placeholder that guessed at the number would flicker to a different one when the real page arrived.
 *
 * @returns The directory skeleton with generic header copy.
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
