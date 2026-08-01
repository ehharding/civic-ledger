import type { Route } from "next";

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
