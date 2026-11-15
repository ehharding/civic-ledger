import { z } from "zod";

import { isValidCongress } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";

/**
 * Validation for the untrusted query params this app's route handlers accept. Every parser is total: a malformed value
 * becomes a usable default (e.g., the first page) rather than a 400 the UI can't explain.
 */

/** Upper bound on a bill-list offset. The UI pages one at a time, so anything larger is a typo or probing. */
export const MAX_BILL_OFFSET: number = 10_000;

/** Longest search query accepted. */
export const MAX_QUERY_LENGTH: number = 200;

/** A non-negative whole offset, clamped to {@link MAX_BILL_OFFSET}. A missing param coerces to `0`, the first page. */
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
 * @returns The requested Congress when browsable, otherwise `currentCongress`.
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
