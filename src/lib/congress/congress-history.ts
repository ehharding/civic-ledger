import { getCongressYearRange, getCurrentCongress } from "@/lib/congress/current-congress";

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
 * Re-exported so callers that think in terms of "the range of Congresses this app covers" have one import to reach for.
 * The implementation lives beside {@link getCurrentCongress} because both derive from the same 1789 anchor year, and
 * that anchor should exist exactly once.
 */
export { getCongressYearRange };

/**
 * Whether `congress` is a whole number this app actually supports browsing.
 *
 * @param congress - The Congress number to check.
 * @param currentCongress - The upper bound. Defaults to the Congress currently seated; injectable so tests don't drift
 *   with the calendar.
 * @returns `true` when the number is a whole number no earlier than {@link EARLIEST_COVERED_CONGRESS} and no later than
 *   `currentCongress` — a future Congress can't yet have any records to browse.
 */
export function isValidCongress(congress: number, currentCongress: number = getCurrentCongress()): boolean {
  return Number.isInteger(congress) && congress >= EARLIEST_COVERED_CONGRESS && congress <= currentCongress;
}

/**
 * Parses a route's raw `congress` param into a validated Congress number.
 *
 * The digits-only guard runs *before* `Number()` on purpose: `Number("-5")` is `-5`, not `NaN`, and `Number(" 119 ")`
 * is `119`, so coercing first would quietly accept several strings that are not the URL they claim to be.
 *
 * @param raw - The raw route param, e.g. `"119"`.
 * @param currentCongress - The upper bound, forwarded to {@link isValidCongress}.
 * @returns The Congress number, or `null` for anything that isn't a clean whole number in the supported range —
 *   non-numeric input, decimals, and signed strings all included. Callers should treat `null` as "not found".
 */
export function parseCongressParam(raw: string, currentCongress: number = getCurrentCongress()): number | null {
  if (!/^\d+$/.test(raw)) return null;

  const value: number = Number(raw);
  return isValidCongress(value, currentCongress) ? value : null;
}

/** One entry in the Congress picker: a Congress number, the calendar years it spans, and whether it's the current one. */
export type CongressHistoryEntry = {
  number: number;
  startYear: number;
  endYear: number;
  isCurrent: boolean;
};

/**
 * Every Congress this app supports browsing, most recent first.
 *
 * Powers the Congress-switcher control on the bill directory routes, the search sweep's list of Congresses to cover,
 * and the per-Congress entries in the sitemap — all three from one definition of "supported".
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
