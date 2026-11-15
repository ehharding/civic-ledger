import { getCongressYearRange, getCurrentCongress } from "@/lib/congress/current-congress";

/**
 * The earliest Congress this app offers for browsing. Congress.gov's bill records begin with the 93rd (1973); earlier
 * material is partial and outside the bill list endpoint.
 *
 * @see https://www.congress.gov/help/legislation
 */
export const EARLIEST_COVERED_CONGRESS: number = 93;

/**
 * Re-exported so callers that think in terms of "the range of Congresses this app covers" have one import to reach for.
 * The implementation lives beside {@link getCurrentCongress} because both derive from the same 1789 anchor year, and
 * that anchor should exist exactly once.
 */
export { getCongressYearRange };

/**
 * Whether `congress` is a whole number this app actually supports browsing.
 *
 * @param congress - The Congress number to check.
 * @param currentCongress - The upper bound. Defaults to the Congress currently seated.
 * @returns `true` for a whole number from {@link EARLIEST_COVERED_CONGRESS} through `currentCongress`.
 */
export function isValidCongress(congress: number, currentCongress: number = getCurrentCongress()): boolean {
  return Number.isInteger(congress) && congress >= EARLIEST_COVERED_CONGRESS && congress <= currentCongress;
}

/**
 * Parses a route's raw `congress` param into a validated Congress number. Checks digits-only before `Number()`, which
 * would accept `"-5"` and `" 119 "`.
 *
 * @param raw - The raw route param, e.g., `"119"`.
 * @param currentCongress - The upper bound, forwarded to {@link isValidCongress}.
 * @returns The Congress number, or `null` (treat as "not found") for anything else.
 */
export function parseCongressParam(raw: string, currentCongress: number = getCurrentCongress()): number | null {
  if (!/^\d+$/.test(raw)) return null;

  const value: number = Number(raw);
  return isValidCongress(value, currentCongress) ? value : null;
}

/** One entry in the Congress picker: a Congress number, the calendar years it spans, and whether it's the current one. */
export type CongressHistoryEntry = {
  /** The Congress number, e.g., `119`. */
  number: number;
  /** The calendar year it convened. */
  startYear: number;
  /** The calendar year it ends. */
  endYear: number;
  /** Whether it is the Congress currently seated. */
  isCurrent: boolean;
};

/**
 * Every Congress this app supports browsing, most recent first — for the Congress switcher, the search sweep, and the
 * sitemap.
 *
 * @param currentCongress - The newest Congress to include. Defaults to the one currently seated.
 * @returns One entry per supported Congress, newest first, each with its calendar span and whether it's the current
 *   one.
 */
export function listCongresses(currentCongress: number = getCurrentCongress()): CongressHistoryEntry[] {
  const entries: CongressHistoryEntry[] = [];

  for (let congress: number = currentCongress; congress >= EARLIEST_COVERED_CONGRESS; congress--) {
    const { startYear, endYear } = getCongressYearRange(congress);
    entries.push({ number: congress, startYear, endYear, isCurrent: congress === currentCongress });
  }

  return entries;
}
