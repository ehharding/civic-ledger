import { z } from "zod";

import { isValidCongress } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";

/**
 * Validation for the query params this app's own route handlers accept.
 *
 * These params arrive from the browser's URL bar, so they're untrusted in exactly the way Congress.gov's responses are,
 * and they deserve the same treatment: parse, don't trust. Keeping the rules here rather than inline in each handler
 * means the clamps are stated once, are unit-testable without spinning up a route, and can't drift between the two
 * endpoints that share them.
 *
 * Every parser here is total — it returns a usable value for *any* input rather than throwing or reporting an error.
 * That's deliberate and matches the routes' own contract: a malformed `offset` should quietly become the first page,
 * not a 400 that the directory's "Load More" button has no way to explain to a person.
 */

/**
 * Upper bound on how far a caller may page into a bill list.
 *
 * Congress.gov itself will happily accept an enormous offset and spend real time answering it. Nothing in this app's UI
 * can reach past a few thousand records — "Load More" advances a page at a time — so a far larger offset is either a
 * typo or someone probing, and neither is worth an upstream round trip.
 */
export const MAX_BILL_OFFSET: number = 10_000;

/**
 * Longest search query accepted. Well past any real citation or phrase; short enough that nothing pathological runs.
 */
export const MAX_QUERY_LENGTH: number = 200;

/**
 * A pagination offset: a non-negative whole number, clamped to {@link MAX_BILL_OFFSET}.
 *
 * `z.coerce.number()` on a missing param yields `0` (`Number(null)`), which is exactly the right default — the first
 * page — so the absent and zero cases need no separate handling.
 */
const offsetSchema: z.ZodCatch<z.ZodPipe<z.ZodCoercedNumber, z.ZodTransform<number, number>>> = z.coerce
  .number()
  .transform((value: number): number =>
    /* v8 ignore start -- `z.coerce.number()` rejects NaN and Infinity itself, so `.catch(0)` fires before this runs. */
    Number.isFinite(value) ? Math.min(MAX_BILL_OFFSET, Math.max(0, Math.trunc(value))) : 0,
  )
  /* v8 ignore stop */
  .catch(0);

/**
 * Parses the `offset` query param.
 *
 * @param raw - The raw param value, or `null` when absent.
 * @returns A whole number between `0` and {@link MAX_BILL_OFFSET}. Non-numeric, negative, fractional, and absurdly
 *   large values all resolve to something valid rather than failing the request.
 */
export function parseOffsetParam(raw: string | null): number {
  return offsetSchema.parse(raw);
}

/**
 * Parses the `congress` query param.
 *
 * @param raw - The raw param value, or `null` when absent.
 * @param currentCongress - The fallback and upper bound. Defaults to the Congress currently seated.
 * @returns The requested Congress when it's one this app supports browsing, otherwise `currentCongress` — so a stale
 *   bookmark or a hand-edited URL degrades to the current Congress instead of an error or an empty page.
 * @see isValidCongress for what "supported" means.
 */
export function parseCongressQueryParam(raw: string | null, currentCongress: number = getCurrentCongress()): number {
  const requested: number = Number(raw);

  return isValidCongress(requested, currentCongress) ? requested : currentCongress;
}

/**
 * Parses the `q` search query param.
 *
 * @param raw - The raw param value, or `null` when absent.
 * @returns The trimmed query, truncated to {@link MAX_QUERY_LENGTH}. An absent or blank param yields an empty string,
 *   which `matchesQuery` treats as matching everything.
 */
export function parseQueryParam(raw: string | null): string {
  return (raw ?? "").trim().slice(0, MAX_QUERY_LENGTH);
}
