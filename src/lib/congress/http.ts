import type { ZodType } from "zod";

import { type CommitteeChamber, committeeChambers, isCommitteeSystemCode } from "@/lib/congress/committees";
import { isBioguideId } from "@/lib/congress/members";
import { BILL_TYPE_PATH_SEGMENTS, type BillRouteParams } from "@/lib/congress/types";

/**
 * The transport layer shared by every Congress.gov read in this app: key access, URL construction, caching policy,
 * one request helper, and the guards that keep route-derived values out of outbound URLs.
 *
 * Nothing here knows what a bill or a member *is* — that's `mappers.ts`'s job. Keeping the two apart means the caching
 * story, the error taxonomy, and the "never interpolate an unvalidated path segment" rule each live in exactly one
 * place instead of being restated at every endpoint.
 */

/** Base URL for every Congress.gov v3 request this app makes. */
export const CONGRESS_API_BASE: string = "https://api.congress.gov/v3";

/**
 * How long Next caches a Congress.gov response before revalidating, in seconds. One shared constant so the app's
 * "five-minute caching" story (see `docs/architecture.md` and the README's Data Policy) lives in a single place instead
 * of a separately-edited literal per endpoint.
 */
export const REVALIDATE_SECONDS: number = 300;

/**
 * The most records Congress.gov will return from a single request, on any endpoint that paginates. Requested
 * explicitly wherever one round trip should cover as much as possible (summaries, text versions, member pages, the
 * search sweep).
 */
export const MAX_API_PAGE_SIZE: number = 250;

/**
 * Reads the server-only Congress.gov API key.
 *
 * Read through this helper rather than `process.env` directly so every data path agrees on what "configured" means: a
 * key set to an empty or whitespace-only value (an easy thing to end up with when copying `.env.example`) counts as
 * *absent*, and takes the clearly labeled preview path rather than sending Congress.gov a blank key and surfacing the
 * resulting 403 as a mysterious outage.
 *
 * @returns The trimmed key, or `undefined` when none is usably configured.
 */
export function getCongressApiKey(): string | undefined {
  const key: string = (process.env.CONGRESS_API_KEY ?? "").trim();
  return key.length > 0 ? key : undefined;
}

/**
 * Builds a Congress.gov v3 request URL.
 *
 * @param path - Endpoint path beneath {@link CONGRESS_API_BASE}, with a leading slash (e.g., `/bill/119/hr/284`).
 *   Every dynamic segment must already have been validated — see {@link normalizeBillRouteParams}.
 * @param apiKey - The server-only key, appended last so it reads as a trailing credential rather than a filter.
 * @param params - Endpoint-specific query params (`limit`, `offset`, `sort`, …).
 * @returns The fully-formed URL, including `format=json` (requested explicitly, per the API's own changelog
 *   recommendation).
 */
export function buildCongressUrl(path: string, apiKey: string, params: Record<string, string> = {}): URL {
  const url: URL = new URL(`${CONGRESS_API_BASE}${path}`);

  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("api_key", apiKey);

  return url;
}

/**
 * Issues a GET request against a Congress.gov v3 endpoint with this app's standard cache window and headers.
 *
 * @param url - A URL built by {@link buildCongressUrl}.
 * @param tags - Next cache tags, so a future revalidation hook can invalidate a whole family of requests at once.
 * @returns The raw response. Prefer {@link requestCongressJson}, which also handles status codes and parsing; this is
 *   exported mainly for the rare caller that needs the response itself.
 */
export function fetchCongressGov(url: URL, tags: string[]): Promise<Response> {
  return fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS, tags },
    headers: { Accept: "application/json" },
  });
}

/**
 * The outcome of one Congress.gov request, as a discriminated union.
 *
 * "Not found" is kept distinct from "failed" deliberately: a 404 is a *true answer* (this bill has no summaries yet),
 * while a 500 or a dropped connection means the app doesn't know. Several callers render those two very differently —
 * an empty section versus a preview-data fallback — so collapsing them into a single `null` would lose the distinction
 * the UI depends on.
 *
 * @typeParam Payload - The validated payload shape for the endpoint being requested.
 */
export type CongressRequestResult<Payload> =
  | { outcome: "ok"; data: Payload }
  | { outcome: "not-found" }
  | { outcome: "failed" };

/**
 * Requests a Congress.gov endpoint and validates the response against `schema`.
 *
 * Every upstream read in this app funnels through here, so the whole error taxonomy — non-200 statuses, network
 * failures, unparseable JSON, and payloads whose shape doesn't match — collapses into one three-outcome union that
 * callers can exhaustively handle. This function never throws.
 *
 * @param url - A URL built by {@link buildCongressUrl}.
 * @param tags - Next cache tags for the request.
 * @param schema - The Zod schema for this endpoint (see `api-schema.ts`).
 * @param context - Short label used in the server-side log line when something goes wrong (e.g., `"bill summaries"`).
 * @returns `{ outcome: "ok", data }` with the validated payload, `{ outcome: "not-found" }` for a 404, or
 *   `{ outcome: "failed" }` for anything else.
 */
export async function requestCongressJson<Payload>(
  url: URL,
  tags: string[],
  schema: ZodType<Payload>,
  context: string,
): Promise<CongressRequestResult<Payload>> {
  try {
    const response: Response = await fetchCongressGov(url, tags);

    if (response.status === 404) return { outcome: "not-found" };
    if (!response.ok) throw new Error(`Congress.gov responded with ${response.status}`);

    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new Error("Congress.gov returned an unrecognized payload shape");

    return { outcome: "ok", data: parsed.data };
  } catch (error) {
    // Logged, never rendered: the caller decides what a person sees, and it is never an upstream error message.
    console.error(`[congress] Request failed (${context}):`, error);
    return { outcome: "failed" };
  }
}

/** The two cache tags shared by every request scoped to one specific bill (detail lookup, summaries, text versions). */
export function billCacheTags(input: BillRouteParams): string[] {
  return ["congress-bills", `bill-${input.congress}-${input.type}-${input.number}`];
}

/** Cache tag shared by every bill *list* request, regardless of which Congress or page it asks for. */
export const BILL_LIST_CACHE_TAG: string = "congress-bills";

/** Cache tag shared by every member-list request. */
export const MEMBER_LIST_CACHE_TAG: string = "congress-members";

/**
 * The two cache tags shared by every request scoped to one member (the profile itself and their legislation lists), so
 * one member's records can be revalidated without dropping the whole roster.
 */
export function memberCacheTags(bioguideId: string): string[] {
  return [MEMBER_LIST_CACHE_TAG, `member-${bioguideId}`];
}

/**
 * Narrows a potentially user-influenced Bioguide ID to the exact path-segment format Congress.gov accepts, before it is
 * interpolated into an outbound URL.
 *
 * Same reasoning as {@link normalizeBillRouteParams}: this arrives from the URL bar, so validating the *shape* rather
 * than escaping means a malformed value can never reach Congress.gov at all.
 *
 * @param raw - The raw `bioguideId` route param.
 * @returns The upper-cased ID, or `null` when it isn't the letter-plus-six-digits form Congress.gov issues. A `null` is
 *   not the same as "not found": the preview fixtures use IDs that deliberately fail this guard and are resolved
 *   locally instead, never upstream.
 *   @see isBioguideId
 */
export function normalizeBioguideId(raw: string): string | null {
  const value: string = raw.trim().toUpperCase();
  return isBioguideId(value) ? value : null;
}

/** Cache tag shared by every committee-list request, regardless of which Congress it asks for. */
export const COMMITTEE_LIST_CACHE_TAG: string = "congress-committees";

/**
 * The two cache tags shared by every request scoped to one committee, so one committee's record can be revalidated
 * without dropping the whole list.
 */
export function committeeCacheTags(systemCode: string): string[] {
  return [COMMITTEE_LIST_CACHE_TAG, `committee-${systemCode}`];
}

/**
 * Narrows a potentially user-influenced committee system code to the exact path-segment format Congress.gov accepts,
 * before it is interpolated into an outbound URL.
 *
 * Same reasoning as {@link normalizeBioguideId}: this arrives from the URL bar, so validating the *shape* rather than
 * escaping means a malformed value can never reach Congress.gov at all.
 *
 * @param raw - The raw `systemCode` route param.
 * @returns The lower-cased code, or `null` when it isn't the letters-then-two-digits form Congress.gov issues. A
 *   `null` is not the same as "not found": the preview fixtures use codes that deliberately fail this guard and are
 *   resolved locally instead, never upstream. @see isCommitteeSystemCode
 */
export function normalizeSystemCode(raw: string): string | null {
  const value: string = raw.trim().toLowerCase();
  return isCommitteeSystemCode(value) ? value : null;
}

/**
 * Narrows a route's chamber segment to one Congress.gov's committee endpoint accepts.
 *
 * The committee endpoint takes the chamber in the path (`/committee/house/hsag00`), which makes this the same class of
 * guard as the two above — and the same closed union the app already models, so no separate list of accepted spellings
 * can drift out of step with it.
 *
 * @param raw - The raw `chamber` route param.
 * @returns The chamber, or `null` when the segment names none.
 */
export function normalizeCommitteeChamberSegment(raw: string): CommitteeChamber | null {
  const value: string = raw.trim().toLowerCase();
  return committeeChambers.find((chamber: CommitteeChamber): boolean => chamber === value) ?? null;
}

/**
 * The only bill/resolution type path segments Congress.gov's bill endpoint accepts.
 *
 * Re-exported from `types.ts` rather than restated here: this list and the citation parser's upper-cased one are the
 * same eight types viewed in two cases, and a copy of it in each module is a copy that can be updated in one place and
 * not the other. @see BILL_TYPE_PATH_SEGMENTS
 */
export const BILL_PATH_TYPES: ReadonlySet<string> = BILL_TYPE_PATH_SEGMENTS;

const CONGRESS_SEGMENT_PATTERN: RegExp = /^\d{1,3}$/;
const BILL_NUMBER_SEGMENT_PATTERN: RegExp = /^\d{1,6}$/;

/** Bill route params proven safe to interpolate into an outbound URL path. @see normalizeBillRouteParams */
export type NormalizedBillRoute = {
  congress: string;
  type: string;
  /** Lower-cased, as Congress.gov's path segments expect. */
  number: string;
};

/**
 * Narrows potentially user-influenced bill route params to the exact path-segment formats Congress.gov accepts, before
 * any of them is interpolated into an outbound URL.
 *
 * These values arrive from the URL bar, so they're untrusted input by definition. Validating the *shape* (digits, and
 * one of eight known type codes) rather than escaping means a malformed segment can never reach Congress.gov at all —
 * it can't traverse the path, smuggle a query param, or turn one endpoint's request into another's.
 *
 * @param input - Raw `congress` / `type` / `number` params, typically straight from the route.
 * @returns The normalized segments (type lower-cased), or `null` when any segment is malformed — which callers should
 *   treat exactly as they treat a 404, since a bill that can't be named can't exist.
 */
export function normalizeBillRouteParams(input: BillRouteParams): NormalizedBillRoute | null {
  const congress: string = input.congress.trim();
  const type: string = input.type.trim().toLowerCase();
  const number: string = input.number.trim();

  if (!CONGRESS_SEGMENT_PATTERN.test(congress)) return null;
  if (!BILL_PATH_TYPES.has(type)) return null;
  if (!BILL_NUMBER_SEGMENT_PATTERN.test(number)) return null;

  return { congress, type, number };
}
