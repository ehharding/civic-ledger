/** The year the 1st Congress convened. Every Congress number in this app is derived from this anchor. */
const FIRST_CONGRESS_YEAR: number = 1789;

/**
 * The Congress currently in session, computed from today's date rather than inferred from whichever bills happen to
 * come back on a given fetch.
 *
 * That data-derived approach (taking the highest `congress` value across a page of bills) was tried first, but
 * Congress.gov's bill list endpoint isn't sorted by congress number or introduction date — it can just as easily
 * surface a bill from decades ago whose record happened to be touched recently, and which specific bills land on a
 * given page shifts with the page size. That made the result inconsistent (e.g., reporting the 110th Congress)
 * depending on how many bills happened to be fetched. There's also no dedicated "current Congress" endpoint to call
 * instead: `/v3/congress` returns the full historical list, unfiltered and unflagged.
 *
 * What *is* reliable is the numbering scheme itself. Since the 20th Amendment (1933), each Congress begins at noon on
 * January 3 of an odd-numbered year and runs for exactly two years. That's a fixed constitutional cadence — not a
 * specific Congress number that will need updating — so computing from it stays correct indefinitely.
 *
 * @param referenceDate - The date to compute from. Defaults to now; tests and any future "as of" view pass their own.
 * @returns The Congress number seated on that date, e.g., `119` for any date in 2025 or 2026.
 */
export function getCurrentCongress(referenceDate: Date = new Date()): number {
  const year: number = referenceDate.getUTCFullYear();

  // January 1st and 2nd still belong to the outgoing Congress: the new one is not seated until January 3rd.
  const isBeforeThisYearsCongressStart: boolean = referenceDate.getUTCMonth() === 0 && referenceDate.getUTCDate() < 3;
  const effectiveYear: number = isBeforeThisYearsCongressStart ? year - 1 : year;

  return Math.max(1, Math.floor((effectiveYear - FIRST_CONGRESS_YEAR) / 2) + 1);
}

/**
 * The two-year term a Congress covers, derived from the same fixed constitutional cadence {@link getCurrentCongress}
 * uses: each Congress begins January 3rd of an odd-numbered year, two years after the previous one, counting back to
 * the 1st Congress in 1789.
 *
 * Lives here, beside the anchor year it depends on, so the two can never disagree about where the sequence starts.
 *
 * @param congress - The Congress number (e.g., `119`).
 * @returns Its calendar span — `{ startYear: 2025, endYear: 2027 }` for the 119th.
 */
export function getCongressYearRange(congress: number): { startYear: number; endYear: number } {
  const startYear: number = FIRST_CONGRESS_YEAR + (congress - 1) * 2;
  return { startYear, endYear: startYear + 2 };
}
