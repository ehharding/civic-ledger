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

/**
 * Builds the in-app route to one Congress's bill directory, e.g., `/bills/118`.
 *
 * The second route shape in this file, and the reason it is here rather than typed at its call sites is the rule
 * `docs/architecture.md` states for this whole family: one definition per route shape, never built inline. Two places
 * need it and they are as far apart as two callers get — the `CongressSwitcher`, which pushes it through the router in
 * the browser, and `sitemap.ts`, which prefixes it with the site origin for a crawler — so an inline template in either
 * one is a path a crawler and a control could disagree about.
 *
 * `/bills` and `/bills/[congress]` both serve the current Congress, and this deliberately returns the second for it
 * too. Every Congress the switcher lists then behaves identically, with no entry that is a special case.
 *
 * @param congress - The Congress number. Accepts a string, as a route param or a `<select>` value has it, or a number,
 *   as `listCongresses` returns it — the same flexibility {@link billHref} offers, for the same reason.
 * @returns The typed in-app route, ready to hand to `next/link` or the router.
 */
export function congressBillsHref(congress: number | string): Route {
  return `/bills/${congress}` as Route;
}
