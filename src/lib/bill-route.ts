import type { Route } from "next";

/**
 * Builds the in-app route to a bill's detail page, e.g., `/bills/119/hr/284`.
 *
 * Shared by every place that links to a bill record (`BillCard`, the homepage's featured-bill card, search results) so
 * none of them can drift out of sync with the route's actual shape.
 *
 * @param bill - Anything carrying a bill's natural identifier. Accepts a numeric `congress` (as `LegislativeBill` has)
 *   or a string one (as route params have) — the same flexibility `billIdentityKey` offers, for the same reason.
 * @returns The typed in-app route, ready to hand to `next/link`.
 */
export function billHref(bill: { congress: number | string; type: string; number: string }): Route {
  return `/bills/${bill.congress}/${bill.type.toLowerCase()}/${bill.number}` as Route;
}
