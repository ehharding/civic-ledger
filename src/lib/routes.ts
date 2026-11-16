import type { Route } from "next";

import type { BillIdentity } from "@/lib/congress/bills/model";
import type { CommitteeChamber } from "@/lib/congress/committees/model";
import { type CommitteeRecordsQuery, committeeRecordsQueryString } from "@/lib/congress/committees/records";
import type { LessonSlug } from "@/lib/lessons";

/**
 * Every in-app route this app builds — "one definition per route shape; never build a route inline"
 * (`docs/architecture.md`). Each builder:
 *
 * - **writes a route shape once**, though bill and member links are built in many places;
 * - **normalizes identifiers** (upstream casing varies), so each record has exactly one URL;
 * - **returns `Route`**, so `next/link` accepts it without a cast, and {@link lessonHref} takes a closed union so a
 *   mistyped slug won't compile.
 *
 * @see `routes.test.ts`, which pins what each builder does to the identifier it is handed.
 */

/**
 * Builds the in-app route to a bill's detail page, e.g., `/bills/119/hr/284`.
 *
 * @param bill - Anything carrying a bill's identifier: a `LegislativeBill` or a bill's route params alike.
 * @returns The typed in-app route, ready to hand to `next/link`.
 */
export function billHref(bill: BillIdentity): Route {
  return `/bills/${bill.congress}/${bill.type.toLowerCase()}/${bill.number}` as Route;
}

/**
 * Builds the in-app route to one Congress's bill directory, e.g., `/bills/118`. Returns the numbered form even for the
 * current Congress, so no switcher entry is a special case.
 *
 * @param congress - The Congress number, as a string (route param, `<select>` value) or number.
 * @returns The typed in-app route, ready to hand to `next/link` or the router.
 */
export function congressBillsHref(congress: number | string): Route {
  return `/bills/${congress}` as Route;
}

/**
 * Builds the in-app route to a member's page, e.g., `/members/L000174` — the Bioguide ID being unique and stable.
 *
 * @param bioguideId - The member's Biographical Directory ID; upper-cased.
 * @returns The typed in-app route, ready to hand to `next/link`.
 */
export function memberHref(bioguideId: string): Route {
  return `/members/${bioguideId.trim().toUpperCase()}` as Route;
}

/**
 * Builds the in-app route to a committee's page, e.g., `/committees/house/hsag00`. The chamber is in the path because
 * Congress.gov's committee endpoint needs it too.
 *
 * @param chamber - The chamber the committee belongs to.
 * @param systemCode - The committee's Congress.gov system code; lower-cased.
 * @returns The typed in-app route, ready to hand to `next/link`.
 */
export function committeeHref(chamber: CommitteeChamber, systemCode: string): Route {
  return `/committees/${chamber}/${systemCode.trim().toLowerCase()}` as Route;
}

/**
 * Builds the route to one view of a committee's records, e.g., `/committees/house/hsag00?records=reports&page=3`. Every
 * tab and pager control in the records section is a real link, so each view is shareable and works without JavaScript.
 * The default view yields the bare committee URL.
 *
 * @param chamber - The chamber the committee belongs to.
 * @param systemCode - The committee's Congress.gov system code.
 * @param query - Which collection to show, and how far into it.
 * @returns The typed in-app route, ready to hand to `next/link`.
 */
export function committeeRecordsHref(
  chamber: CommitteeChamber,
  systemCode: string,
  query: CommitteeRecordsQuery,
): Route {
  return `${committeeHref(chamber, systemCode)}${committeeRecordsQueryString(query)}` as Route;
}

/**
 * Builds the in-app route to a learning module, e.g., `/learn/how-a-bill-becomes-law`. Takes a {@link LessonSlug}, so
 * the few slugs typed outside `lessons.ts` are checked at compile time.
 *
 * @param slug - The lesson's slug, as its registry entry declares it.
 * @returns The typed in-app route, ready to hand to `next/link`.
 */
export function lessonHref(slug: LessonSlug): Route {
  return `/learn/${slug}` as Route;
}
