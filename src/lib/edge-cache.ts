import { REVALIDATE_SECONDS } from "@/lib/congress/upstream/http";

/**
 * How long the CDN may keep serving a cached API response after it expires, while it fetches a fresh one in the
 * background, in seconds.
 *
 * An hour, because the alternative is worse in both directions: the reader would otherwise wait on a function
 * invocation for a response the CDN already holds, and the records behind it rarely change faster than this anyway.
 * Only the first request after expiry pays for the refresh, and it does not wait for it.
 */
export const EDGE_STALE_SECONDS: number = 3_600;

/**
 * The `Cache-Control` value for a same-origin API response the CDN may share between readers.
 *
 * **Why the API routes need this and the pages do not.** Next sets `s-maxage` on every static and ISR page itself, so
 * the CDN already serves `/bills` without invoking a function. Route handlers that read their request URL get no such
 * header — they are dynamic, and every call was a function invocation, even for a query the CDN had answered a moment
 * earlier for someone else. `/api/bills/search` is the expensive case: each call reads and validates a page of up to
 * 250 bills from every supported Congress before it filters anything, so one popular query searched a hundred times was
 * a hundred full sweeps. With this, it is one sweep per query per window.
 *
 * Keyed by the full URL, query included, so `?q=broadband` and `?q=farm` are cached apart. The window is the app's one
 * shared five-minute window, so a cached response is never older than the data behind a page rendered beside it.
 * Nothing here is per-reader: these responses carry public records and read no cookie or header, so `public` is safe.
 *
 * @see REVALIDATE_SECONDS
 */
export const EDGE_CACHE_CONTROL: string = `public, max-age=0, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${EDGE_STALE_SECONDS}`;

/** The `Cache-Control` value for a response the CDN must not keep, such as a degraded one. */
export const NO_STORE_CACHE_CONTROL: string = "no-store";
