/**
 * The Congress currently in session, computed from today's date rather than inferred from whichever bills happen to
 * come back on a given fetch.
 *
 * That data-derived approach (taking the highest `congress` value across a page of bills) was tried first, but
 * Congress.gov's bill list endpoint isn't sorted by congress number or introduction date — it can just as easily
 * surface a bill from decades ago whose record happened to be touched recently, and which specific bills land on
 * a given page shifts with the page size. That made the result inconsistent (e.g., reporting the 110th Congress)
 * depending on how many bills happened to be fetched. There's also no dedicated "current Congress" endpoint to call
 * instead (`/v3/congress` returns the full historical list, unfiltered and unflagged).
 *
 * What is reliable is the numbering scheme itself: since the 20th Amendment (1933), each Congress begins at noon on
 * January 3 of an odd-numbered year and runs for exactly two years. That's a fixed, constitutional cadence — not a
 * specific Congress number that will need updating — so computing from it stays correct indefinitely.
 */
export function getCurrentCongress(referenceDate: Date = new Date()): number {
  const year: number = referenceDate.getUTCFullYear();
  const isBeforeThisYearsCongressStart: boolean = referenceDate.getUTCMonth() === 0 && referenceDate.getUTCDate() < 3;
  const effectiveYear: number = isBeforeThisYearsCongressStart ? year - 1 : year;

  return Math.floor((effectiveYear - 1789) / 2) + 1;
}
