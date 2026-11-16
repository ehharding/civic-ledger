import { REVALIDATE_SECONDS } from "@/lib/congress/upstream/http";

/**
 * How long, in seconds, the CDN may keep serving an expired API response while it refreshes it in the background.
 *
 * An hour: the records rarely change faster, and only the first request after expiry triggers the refresh, without
 * waiting on it.
 */
export const EDGE_STALE_SECONDS: number = 3_600;

/**
 * The `Cache-Control` value for a same-origin API response the CDN may share between readers.
 *
 * Next sets `s-maxage` on static and ISR pages itself, but not on route handlers that read their URL, so without this
 * every call is a function invocation. `/api/bills/search` is the costly case: each call sweeps up to 250 bills from
 * every supported Congress, and this makes it one sweep per query per window.
 *
 * Keyed by the full URL, so `?q=broadband` and `?q=farm` cache apart, on the app's shared window so a response is never
 * older than a page rendered beside it. `public` is safe: these are public records, and nothing reads a cookie or
 * header.
 *
 * @see REVALIDATE_SECONDS
 */
export const EDGE_CACHE_CONTROL: string = `public, max-age=0, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${EDGE_STALE_SECONDS}`;

/** The `Cache-Control` value for a response the CDN must not keep, such as a degraded one. */
export const NO_STORE_CACHE_CONTROL: string = "no-store";
