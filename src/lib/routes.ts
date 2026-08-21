import type { Route } from "next";

import type { CommitteeChamber } from "@/lib/congress/committees/model";
import { type CommitteeRecordsQuery, committeeRecordsQueryString } from "@/lib/congress/committees/records";
import type { LessonSlug } from "@/lib/lessons";

/**
 * Every in-app route this app builds, and the only place any of them is spelled.
 *
 * `docs/architecture.md` states one rule for the whole family — "One definition per route shape; never build a route
 * inline" — and this is the file that rule names. Until this existed it named a glob, `src/lib/*-route.ts`, which was
 * the one concern in that table without a single home: four files of one or two functions each, differing only in the
 * word before the hyphen, sharing one test suite because a reader who wants "how do I link to a record" wants all of
 * them at once. Collected here, the row reads like every other row.
 *
 * What every builder in this file has in common, and why each one is worth a function rather than a template literal at
 * the call site:
 *
 * - **A route shape is written once.** A link to a bill is built by a directory card, the homepage's featured card, a
 *   member's sponsored list, and a search result; a link to a person by a seat in the chamber diagram, a sponsor line,
 *   and a cosponsor list. An inline template in any one of them is a path the others can drift away from.
 * - **Identifiers are normalized on the way in.** Upstream records are not consistently cased — `HR` and `hr`, a
 *   Bioguide ID in either case, a system code in either — and two spellings of one record's URL are two pages to a
 *   crawler, two entries in history, and two cache keys. Normalizing here means every link to a record is *the* link to
 *   that record, wherever it was built from.
 * - **The type system carries the promise.** Each returns `Route`, so `next/link` and the router accept it without a
 *   cast at the call site, and {@link lessonHref} takes a closed union rather than a `string` so a mistyped slug is a
 *   compile error rather than a link that renders and 404s.
 *
 * @see `routes.test.ts`, which pins what each builder does to the identifier it is handed.
 */

/**
 * Builds the in-app route to a bill's detail page, e.g., `/bills/119/hr/284`.
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
 * Two places need it and they are as far apart as two callers get — the `CongressSwitcher`, which pushes it through the
 * router in the browser, and `sitemap.ts`, which prefixes it with the site origin for a crawler — so an inline template
 * in either one is a path a crawler and a control could disagree about.
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

/**
 * Builds the in-app route to a member's page, e.g., `/members/L000174`.
 *
 * The Bioguide ID is the whole path: it's already unique, already stable (unlike a name slug, which changes when a
 * member's published name does), and already the identifier every other member-scoped thing in this app is keyed on.
 *
 * @param bioguideId - The member's Biographical Directory ID. Upper-cased so a link built from an inconsistently-cased
 *   upstream record still points at the same URL as every other link to that person.
 * @returns The typed in-app route, ready to hand to `next/link`.
 */
export function memberHref(bioguideId: string): Route {
  return `/members/${bioguideId.trim().toUpperCase()}` as Route;
}

/**
 * Builds the in-app route to a committee's page, e.g., `/committees/house/hsag00`.
 *
 * The chamber is in the path rather than only the system code, for one concrete reason: Congress.gov's own committee
 * endpoint is keyed on both, so a route that carried only the code would have to guess the chamber back before it could
 * look anything up. Carrying it means the URL contains everything the lookup needs, and reads as what it is.
 *
 * @param chamber - The chamber the committee belongs to.
 * @param systemCode - The committee's Congress.gov system code. Lower-cased so a link built from an
 *   inconsistently-cased upstream record points at the same URL as every other link to that committee.
 * @returns The typed in-app route, ready to hand to `next/link`.
 */
export function committeeHref(chamber: CommitteeChamber, systemCode: string): Route {
  return `/committees/${chamber}/${systemCode.trim().toLowerCase()}` as Route;
}

/**
 * Builds the route to one view of a committee's records, e.g., `/committees/house/hsag00?records=reports&page=3`.
 *
 * Every control in the records section is one of these — the collection tabs, the pager's two arrows, and the count
 * tiles above them — because they are all the same thing: a link to this committee's page showing a different slice of
 * it. That is what makes each of them shareable, openable in a new tab, followable by a crawler, and reachable with
 * JavaScript disabled, none of which a click handler over local state would be.
 *
 * Built on {@link committeeHref} rather than beside it, so the two can never disagree about the path a committee lives
 * at, and on `committeeRecordsQueryString` for the query, so a view that is at its default produces the bare committee
 * URL rather than one carrying params that both say "the default".
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
 * Builds the in-app route to a learning module, e.g., `/learn/how-a-bill-becomes-law`.
 *
 * The lesson slug is written down once, in `src/lib/lessons.ts`, and read by the hub index, each lesson's own "read
 * this next" callout, the sitemap, and the route's `generateStaticParams`. A slug typed inline at any one of those is a
 * lesson that exists but cannot be reached from somewhere.
 *
 * The parameter is {@link LessonSlug} rather than `string`, which is what makes that promise hold at the two call sites
 * that *do* type a slug inline — the bill page's link to the voting module, the committee page's link to the committee
 * one. Those are the only places a slug is written outside the registry, and against a `string` parameter a typo in
 * either was a link that compiled, rendered, and 404'd. @see LessonSlug, whose whole purpose is to be that check;
 * before this it was a closed union nothing outside its own file consulted.
 *
 * @param slug - The lesson's slug, as its registry entry declares it.
 * @returns The typed in-app route, ready to hand to `next/link`.
 */
export function lessonHref(slug: LessonSlug): Route {
  return `/learn/${slug}` as Route;
}
