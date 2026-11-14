import type { PageHeaderCopy } from "@/components/layout/page-header";

/**
 * The header copy the `/bills` route and its loading skeleton both render, shared so the skeleton resolves into the
 * page without layout shift.
 *
 * `/bills/[congress]` can't do the same: Next gives loading UI no params, so its skeleton can't know which Congress it
 * stands in for and uses generic copy instead.
 */
export const CURRENT_CONGRESS_BILLS_HEADER: PageHeaderCopy = {
  eyebrow: "Legislation",
  title: "Start With the Record.",
  description: "Search the current Congress's bills, then follow each record back to its official Congress.gov source.",
};
