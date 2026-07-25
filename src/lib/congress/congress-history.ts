import { getCurrentCongress } from "@/lib/congress/current-congress";

/**
 * The earliest Congress this app offers for browsing by Congress.
 *
 * Congress.gov's own records for introduced bills and resolutions begin with the 93rd Congress (1973) — see "About
 * Legislation of the U.S. Congress" (https://www.congress.gov/help/legislation). Earlier Congresses have only partial,
 * largely non-digitized material (a handful of enacted laws back to the 82nd Congress, and scattered records back to
 * the 6th), which the bill list endpoint this app relies on doesn't cover. Bounding the picker here keeps every listed
 * Congress pointing at a page that can actually resolve real records once a live key is configured, rather than one the
 * API was never going to return anything for.
 */
export const EARLIEST_COVERED_CONGRESS: number = 93;

/**
 * The two-year term a Congress covers, derived from the same fixed constitutional cadence `getCurrentCongress` uses:
 * each Congress begins January 3 of an odd-numbered year, two years after the previous one, counting back to the 1st
 * Congress in 1789.
 */
export function getCongressYearRange(congress: number): { startYear: number; endYear: number } {
  const startYear: number = 1789 + (congress - 1) * 2;
  return { startYear, endYear: startYear + 2 };
}

/**
 * Whether `congress` is a whole number this app actually supports browsing: no earlier than
 * `EARLIEST_COVERED_CONGRESS`, and no later than the Congress currently seated (a future Congress number can't yet have
 * any records).
 */
export function isValidCongress(congress: number, currentCongress: number = getCurrentCongress()): boolean {
  return Number.isInteger(congress) && congress >= EARLIEST_COVERED_CONGRESS && congress <= currentCongress;
}

/**
 * Parses a route's raw `congress` param (e.g., `"119"`) into a validated Congress number, or `null` for anything that
 * isn't a clean whole number in the supported range — including non-numeric input, decimals, and signed strings that
 * `Number()` would otherwise coerce (`Number("-5")` is `-5`, not `NaN`). Callers should treat `null` as "not found."
 */
export function parseCongressParam(raw: string, currentCongress: number = getCurrentCongress()): number | null {
  if (!/^\d+$/.test(raw)) return null;

  const value: number = Number(raw);
  return isValidCongress(value, currentCongress) ? value : null;
}

/**
 * One entry in the Congress picker: a Congress number, the calendar years it spans, and whether it's the current one.
 */
export type CongressHistoryEntry = {
  number: number;
  startYear: number;
  endYear: number;
  isCurrent: boolean;
};

/**
 * Every Congress this app supports browsing, most recent first — powers the Congress-switcher control on the bill
 * directory routes.
 */
export function listCongresses(currentCongress: number = getCurrentCongress()): CongressHistoryEntry[] {
  const entries: CongressHistoryEntry[] = [];

  for (let congress: number = currentCongress; congress >= EARLIEST_COVERED_CONGRESS; congress--) {
    const { startYear, endYear } = getCongressYearRange(congress);
    entries.push({ number: congress, startYear, endYear, isCurrent: congress === currentCongress });
  }

  return entries;
}
