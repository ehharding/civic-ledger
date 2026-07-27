import type { Route } from "next";

/**
 * Builds the in-app route to a bill's detail page (e.g., `/bills/119/hr/284`) from its natural identifier — congress,
 * type, and number. Shared by every place that links to a bill record (BillCard, the homepage's featured-bill card) so
 * they can't drift out of sync with the route's actual shape.
 *
 * Accepts a numeric `congress` (as `LegislativeBill` itself has) or a string one (as route params have) — the same
 * flexibility `billIdentityKey` offers, for the same reason.
 */
export function billHref(bill: { congress: number | string; type: string; number: string }): Route {
  return `/bills/${bill.congress}/${bill.type.toLowerCase()}/${bill.number}` as Route;
}
