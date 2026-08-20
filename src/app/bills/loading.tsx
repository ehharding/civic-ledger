import type { JSX } from "react";

import { CURRENT_CONGRESS_BILLS_HEADER } from "@/app/bills/header-copy";
import { BillDirectorySkeleton } from "@/components/bills/bill-directory-skeleton";

/**
 * Streamed by Next while the `/bills` route's snapshot fetch resolves.
 *
 * The header copy is the route's own, imported rather than restated, so the skeleton cannot resolve into a page whose
 * header is a different height. @see CURRENT_CONGRESS_BILLS_HEADER.
 *
 * @returns The directory skeleton with this route's header copy.
 */
export default function BillsLoading(): JSX.Element {
  return <BillDirectorySkeleton {...CURRENT_CONGRESS_BILLS_HEADER} />;
}
