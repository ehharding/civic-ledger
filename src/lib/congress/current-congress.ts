/** The year the 1st Congress convened. Every Congress number in this app is derived from this anchor. */
const FIRST_CONGRESS_YEAR: number = 1789;

/**
 * The Congress currently in session, computed from the date.
 *
 * Congress.gov has no "current Congress" endpoint (`/v3/congress` lists every one, unflagged), and the bill list isn't
 * sorted by Congress, so the number can't be read reliably off fetched data. The calendar is reliable: since the 20th
 * Amendment, each Congress begins January 3 of an odd-numbered year and runs two years.
 *
 * Takes the whole day of January 3 as the new Congress, though it convenes at noon.
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
 * @param congress - The Congress number (e.g., `119`).
 * @returns Its calendar span — `{ startYear: 2025, endYear: 2027 }` for the 119th.
 */
export function getCongressYearRange(congress: number): { startYear: number; endYear: number } {
  const startYear: number = FIRST_CONGRESS_YEAR + (congress - 1) * 2;
  return { startYear, endYear: startYear + 2 };
}
