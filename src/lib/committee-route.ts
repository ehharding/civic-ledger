import type { Route } from "next";

import { type CommitteeRecordsQuery, committeeRecordsQueryString } from "@/lib/congress/committee-records";
import type { CommitteeChamber } from "@/lib/congress/committees";

/**
 * Builds the in-app route to a committee's page, e.g. `/committees/house/hsag00`.
 *
 * Shared by every place that links to a committee — a directory card, a parent's subcommittee list, a subcommittee's
 * link back up — so none of them can drift out of sync with the route's shape.
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
 * Builds the route to one view of a committee's records, e.g. `/committees/house/hsag00?records=reports&page=3`.
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
