import type { JSX } from "react";

import { BillDirectorySkeleton } from "@/components/bill-directory-skeleton";

/** Streamed by Next while the /bills route's async data fetch resolves. Purely decorative — no real data. */
export default function BillsLoading(): JSX.Element {
  return (
    <BillDirectorySkeleton
      description="Search the current Congress's bills, then follow each record back to its official Congress.gov source."
      eyebrow="Legislation"
      title="Start With the Record."
    />
  );
}
