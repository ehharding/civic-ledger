import type { ZodType } from "zod";

import { BILL_TYPE_PATH_SEGMENTS, type BillRouteParams } from "@/lib/congress/bills/model";
import { type CommitteeChamber, committeeChambers, isCommitteeSystemCode } from "@/lib/congress/committees/model";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { isBioguideId } from "@/lib/congress/members/model";
import type { CongressApiPagination } from "@/lib/congress/upstream/api-schema";
import { logError, logWarning } from "@/lib/observability/log";

/**
 * The transport layer for every Congress.gov read: key access, URL construction, caching policy, one request helper,
 * and the guards that keep route-derived values out of outbound URLs. What the data *means* is `mappers.ts`'s job.
 */

// Cache windows.

/**
 * How long Next caches a Congress.gov response before revalidating, in seconds. One shared constant so the app's
 * "five-minute caching" story (see `docs/architecture.md` and the README's Data Policy) lives in a single place instead
 * of a separately-edited literal per endpoint.
 */
export const REVALIDATE_SECONDS: number = 300;

/**
 * How long Next caches a response scoped to a Congress that has ended: one day. Its record is closed, so five-minute
 * refreshes would only cost renders — but not frozen, since corrections and public-law numbers arrive for weeks after.
 *
 * Two routes restate this as their segment `revalidate` (as a literal, pinned by `src/app/revalidate.test.ts`) so a
 * page rendered during an outage still refreshes within a day.
 *
 * @see revalidateSecondsForCongress
 */
export const CONCLUDED_CONGRESS_REVALIDATE_SECONDS: number = 86_400;

/**
 * The cache window for a request scoped to one Congress: five minutes for the current (or a later) Congress, a day for
 * a concluded one. A route takes the shortest window among its fetches, so this alone sets a past Congress's pages to
 * daily.
 *
 * @param congress - The Congress the request is scoped to, as a number or an already-validated path segment.
 * @param currentCongress - The Congress now sitting. Defaults to today's; a parameter so tests can pin the boundary.
 * @returns {@link CONCLUDED_CONGRESS_REVALIDATE_SECONDS} for a Congress that has ended, else
 *   {@link REVALIDATE_SECONDS}.
 */
export function revalidateSecondsForCongress(
  congress: number | string,
  currentCongress: number = getCurrentCongress(),
): number {
  return Number(congress) < currentCongress ? CONCLUDED_CONGRESS_REVALIDATE_SECONDS : REVALIDATE_SECONDS;
}

/**
 * A cache window of "none": the response isn't stored in Next's Data Cache. For requests whose result the rendering ISR
 * page already holds, where a second (metered) copy is pure cost — a bill page makes eight requests.
 *
 * This doesn't make an ISR route dynamic: Next treats an option-less `fetch` as "auto no cache" and leaves the
 * segment's `revalidate` in charge.
 */
export const UNCACHED: null = null;

/** A cache window in seconds, or {@link UNCACHED}. */
export type CacheWindow = number | typeof UNCACHED;

/**
 * The cache window for a request made while rendering a bill's own page. A concluded Congress's page is already cached
 * a day by its segment, so its requests are {@link UNCACHED}; the current Congress keeps five minutes, which is what
 * keeps its page fresh.
 *
 * @param congress - The bill's Congress.
 * @param currentCongress - The Congress now sitting. Defaults to today's; a parameter so tests can pin the boundary.
 * @returns {@link UNCACHED} for a Congress that has ended, else {@link REVALIDATE_SECONDS}.
 */
export function billPageCacheWindow(
  congress: number | string,
  currentCongress: number = getCurrentCongress(),
): CacheWindow {
  return Number(congress) < currentCongress ? UNCACHED : REVALIDATE_SECONDS;
}

// Requests: every upstream read goes through these.

/** Base URL for every Congress.gov v3 request this app makes. */
export const CONGRESS_API_BASE: string = "https://api.congress.gov/v3";

/**
 * The most records Congress.gov will return from a single request, on any endpoint that paginates. Requested explicitly
 * wherever one round trip should cover as much as possible (summaries, text versions, member pages, the search sweep).
 */
export const MAX_API_PAGE_SIZE: number = 250;

/**
 * How long a single Congress.gov request may take before it's abandoned, in milliseconds. `fetch` has no timeout, and a
 * stalled request never reaches the `catch` that turns it into a fallback. This matters most for the search sweep,
 * where one stalled Congress would otherwise hold up the rest. Well past normal response times for a 250-record page.
 */
export const REQUEST_TIMEOUT_MS: number = 10_000;

/**
 * Reads the server-only Congress.gov API key. A blank or whitespace-only value (easy to copy from `.env.example`)
 * counts as absent, so it takes the preview path instead of producing 403s.
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
 * @param path - Endpoint path beneath {@link CONGRESS_API_BASE}, with a leading slash (e.g., `/bill/119/hr/284`). Every
 *   dynamic segment must already have been validated — see {@link normalizeBillRouteParams}.
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
 * Issues a GET against a Congress.gov v3 endpoint with the standard cache window, headers, and timeout. The abort
 * signal is per-call; Next strips it on background revalidation, so it only bounds requests a reader is waiting on.
 *
 * @param url - A URL built by {@link buildCongressUrl}.
 * @param tags - Next cache tags, so a future revalidation hook can invalidate a whole family of requests at once.
 * @param revalidate - The cache window in seconds. Defaults to the shared five minutes; a request scoped to one
 *   Congress passes {@link revalidateSecondsForCongress} instead.
 * @returns The raw response. Rejects with a `TimeoutError` if the request outlasts {@link REQUEST_TIMEOUT_MS}, which
 *   {@link requestCongressJson} turns into an ordinary `{ outcome: "failed" }` like any other transport failure. Prefer
 *   that function, which also handles status codes and parsing; this is exported mainly for the rare caller that needs
 *   the response itself.
 */
export function fetchCongressGov(
  url: URL,
  tags: string[],
  revalidate: CacheWindow = REVALIDATE_SECONDS,
): Promise<Response> {
  return fetch(url, {
    // Omitted entirely rather than spelled `cache: "no-store"`: an explicit no-store would make the rendering route
    // dynamic, which is the opposite of the point. See UNCACHED.
    ...(revalidate === UNCACHED ? {} : { next: { revalidate, tags } }),
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/**
 * The outcome of one Congress.gov request. "Not found" is distinct from "failed": a 404 is a true answer (no summaries
 * yet), while a 500 or dropped connection means the app doesn't know, and callers render those differently.
 *
 * @typeParam Payload - The validated payload shape for the endpoint being requested.
 */
export type CongressRequestResult<Payload> =
  | { outcome: "ok"; data: Payload }
  | { outcome: "not-found" }
  | { outcome: "failed" };

/**
 * Requests a Congress.gov endpoint and validates the response against `schema`. Every upstream read goes through here,
 * collapsing status, network, parse, and shape failures into one three-outcome union. Never throws.
 *
 * Every `failed` outcome is logged at a level matching its kind — the only report it produces, since nothing throws.
 *
 * @param url - A URL built by {@link buildCongressUrl}.
 * @param tags - Next cache tags for the request.
 * @param schema - The Zod schema for this endpoint (see `api-schema.ts`).
 * @param context - Short label identifying the caller in a log line (e.g., `"bill summaries"`), recorded as a
 *   structured attribute rather than interpolated into the message, so an incident can be filtered to one endpoint.
 * @param revalidate - The cache window in seconds.
 * @returns `{ outcome: "ok", data }` with the validated payload, `{ outcome: "not-found" }` for a 404, or
 *   `{ outcome: "failed" }` for anything else.
 * @see fetchCongressGov
 * @see src/lib/observability/log.ts
 */
export async function requestCongressJson<Payload>(
  url: URL,
  tags: string[],
  schema: ZodType<Payload>,
  context: string,
  revalidate: CacheWindow = REVALIDATE_SECONDS,
): Promise<CongressRequestResult<Payload>> {
  // The one place in this app that holds the key *and* reports a failure, so the one place that has to declare it. The
  // same arrangement `sentry.server.config.ts` makes with `sentryInitOptions`. See LogDetails.secrets.
  const secrets: readonly string[] = [getCongressApiKey() ?? ""];

  try {
    const response: Response = await fetchCongressGov(url, tags, revalidate);

    if (response.status === 404) return { outcome: "not-found" };

    if (!response.ok) {
      // Weather, not a defect: Congress.gov is rate-limiting, briefly down, or refusing a key. The reader gets degraded
      // content either way, and what an operator needs is the count and the status code, not a stack.
      logWarning("Congress.gov request failed", {
        attributes: { event: "congress.request-failed", reason: "http-status", context, status: response.status },
        secrets,
      });
      return { outcome: "failed" };
    }

    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
      // A defect, and the one upstream failure that is: a 200 whose body no longer matches `api-schema.ts` means either
      // Congress.gov changed its contract or this app reads it wrongly. Nothing retries its way out of that, and the
      // symptom without a report is a section of a page that is permanently and silently empty.
      logError("Congress.gov returned an unrecognized payload shape", {
        attributes: {
          event: "congress.request-failed",
          reason: "schema-mismatch",
          context,
          // The failing field paths, not the payload. `["bills", 0, "latestAction"]` is what makes this actionable
          // without shipping a response body to a third party to get it.
          paths: describeSchemaIssues(parsed.error.issues),
        },
        secrets,
      });
      return { outcome: "failed" };
    }

    return { outcome: "ok", data: parsed.data };
  } catch (error) {
    // Transport: a timeout from `REQUEST_TIMEOUT_MS`, a dropped connection, a DNS failure, or a body that was not JSON.
    // `describeCause` walks the `cause` chain, which is what separates a useful line here from `TypeError: fetch
    // failed` — Node's `fetch` keeps the actual diagnosis one level down.
    logWarning("Congress.gov request failed", {
      attributes: { event: "congress.request-failed", reason: "transport", context },
      cause: error,
      secrets,
    });
    return { outcome: "failed" };
  }
}

/** How many schema issue paths a single log line carries. A drifted payload fails the same way in every record. */
const MAX_REPORTED_SCHEMA_ISSUES: number = 5;

/**
 * Summarizes a Zod failure as just the failing field paths — the full error is long and can quote the response body.
 *
 * @param issues - The issues from a failed `safeParse`.
 * @returns Up to {@link MAX_REPORTED_SCHEMA_ISSUES} dotted paths, comma-separated, with the root spelled `(root)`.
 */
function describeSchemaIssues(issues: readonly { path: PropertyKey[] }[]): string {
  return issues
    .slice(0, MAX_REPORTED_SCHEMA_ISSUES)
    .map((issue: { path: PropertyKey[] }): string =>
      issue.path.length === 0 ? "(root)" : issue.path.map(String).join("."),
    )
    .join(", ");
}

/**
 * Fetches every page of a paginated list, across as many requests as it takes.
 *
 * The first page goes out alone, to read `pagination.count`; the remaining pages then go out together rather than one
 * after another — two round trips however long the list, instead of one per page.
 *
 * @typeParam Page - One validated page of the list.
 * @typeParam Item - One unmapped record on a page.
 * @param fetchPage - Requests the page starting at `offset`, resolving `null` on any failure.
 * @param itemsOf - Reads the records off a page.
 * @param maxPages - Hard ceiling on pages requested, so a malformed `pagination.count` cannot turn one page render into
 *   an unbounded fetch loop.
 * @returns Every record found, or `null` only when the *first* page fails. A later page failing yields what did arrive:
 *   a list missing its tail is still worth rendering, and the callers would rather show most of a roster than none.
 */
export async function fetchAllPages<Page extends { pagination?: CongressApiPagination | undefined }, Item>(
  fetchPage: (offset: number) => Promise<Page | null>,
  itemsOf: (page: Page) => Item[] | undefined,
  maxPages: number,
): Promise<Item[] | null> {
  const firstPage: Page | null = await fetchPage(0);
  if (!firstPage) return null;

  const firstItems: Item[] = itemsOf(firstPage) ?? [];
  const total: number = firstPage.pagination?.count ?? firstItems.length;
  const pageCount: number = Math.min(maxPages, Math.ceil(total / MAX_API_PAGE_SIZE));

  if (pageCount <= 1) return firstItems;

  const laterPages: (Page | null)[] = await Promise.all(
    Array.from(
      { length: pageCount - 1 },
      (_unused: unknown, index: number): Promise<Page | null> => fetchPage((index + 1) * MAX_API_PAGE_SIZE),
    ),
  );

  return [...firstItems, ...laterPages.flatMap((page: Page | null): Item[] => (page ? (itemsOf(page) ?? []) : []))];
}

// Cache tags, one list tag and one per-record tag set for each record type.

/** Cache tag shared by every bill *list* request, regardless of which Congress or page it asks for. */
export const BILL_LIST_CACHE_TAG: string = "congress-bills";

/**
 * The two cache tags shared by every request scoped to one bill. The identifier is normalized because it arrives in
 * several casings (`hr` from routes, `HR` from parsed citations), and one bill must have one tag to be invalidated as a
 * whole.
 *
 * @param input - The bill's identifier, in any of the casings the app produces.
 * @returns The list tag and this bill's own tag, the latter in one canonical spelling.
 */
export function billCacheTags(input: BillRouteParams): string[] {
  const congress: string = input.congress.trim();
  const type: string = input.type.trim().toLowerCase();
  const number: string = input.number.trim();

  return [BILL_LIST_CACHE_TAG, `bill-${congress}-${type}-${number}`];
}

/** Cache tag shared by every member-list request. */
export const MEMBER_LIST_CACHE_TAG: string = "congress-members";

/**
 * The two cache tags shared by every request scoped to one member (the profile itself and their legislation lists), so
 * one member's records can be revalidated without dropping the whole roster.
 *
 * @param bioguideId - The member's Bioguide ID.
 * @returns The roster-wide tag and the member's own.
 */
export function memberCacheTags(bioguideId: string): string[] {
  return [MEMBER_LIST_CACHE_TAG, `member-${bioguideId}`];
}

/** Cache tag shared by every committee-list request, regardless of which Congress it asks for. */
export const COMMITTEE_LIST_CACHE_TAG: string = "congress-committees";

/**
 * The two cache tags shared by every request scoped to one committee, so one committee's record can be revalidated
 * without dropping the whole list.
 *
 * @param systemCode - The committee's system code.
 * @returns The list-wide tag and the committee's own.
 */
export function committeeCacheTags(systemCode: string): string[] {
  return [COMMITTEE_LIST_CACHE_TAG, `committee-${systemCode}`];
}

// Path segments: every identifier from a URL is proven safe here before it is interpolated into an outbound path.

/**
 * Validates a route's Bioguide ID before it goes into an outbound URL.
 *
 * @param raw - The raw `bioguideId` route param.
 * @returns The upper-cased ID, or `null` when malformed. Preview fixture IDs fail this deliberately and resolve
 *   locally.
 * @see normalizeBillRouteParams
 * @see isBioguideId
 */
export function normalizeBioguideId(raw: string): string | null {
  const value: string = raw.trim().toUpperCase();
  return isBioguideId(value) ? value : null;
}

/**
 * Validates a route's committee system code before it goes into an outbound URL.
 *
 * @param raw - The raw `systemCode` route param.
 * @returns The lower-cased code, or `null` when malformed. Preview fixture codes fail this deliberately and resolve
 *   locally.
 * @see normalizeBillRouteParams
 * @see isCommitteeSystemCode
 */
export function normalizeSystemCode(raw: string): string | null {
  const value: string = raw.trim().toLowerCase();
  return isCommitteeSystemCode(value) ? value : null;
}

/**
 * Validates a route's chamber segment, which the committee endpoint takes in its path (`/committee/house/hsag00`).
 *
 * @param raw - The raw `chamber` route param.
 * @returns The chamber, or `null` when the segment names none.
 */
export function normalizeCommitteeChamberSegment(raw: string): CommitteeChamber | null {
  const value: string = raw.trim().toLowerCase();
  return committeeChambers.find((chamber: CommitteeChamber): boolean => chamber === value) ?? null;
}

/** A `congress` route segment: one to three digits. */
const CONGRESS_SEGMENT_PATTERN: RegExp = /^\d{1,3}$/;

/** A bill `number` route segment: one to six digits. */
const BILL_NUMBER_SEGMENT_PATTERN: RegExp = /^\d{1,6}$/;

/**
 * Bill route params proven safe to interpolate into an outbound URL path.
 *
 * @see normalizeBillRouteParams
 */
export type NormalizedBillRoute = {
  /** The Congress number, digits only. */
  congress: string;
  /** Lower-cased, as Congress.gov's path segments expect. */
  type: string;
  /** The bill number, digits only. */
  number: string;
};

/**
 * Validates bill route params before they go into an outbound URL. Checking the *shape* (digits and a known type code)
 * rather than escaping means a malformed segment never reaches Congress.gov — no path traversal or smuggled query.
 *
 * @param input - Raw `congress` / `type` / `number` params, typically straight from the route.
 * @returns The normalized segments (type lower-cased), or `null` when any is malformed — treat that as a 404.
 */
export function normalizeBillRouteParams(input: BillRouteParams): NormalizedBillRoute | null {
  const congress: string = input.congress.trim();
  const type: string = input.type.trim().toLowerCase();
  const number: string = input.number.trim();

  if (!CONGRESS_SEGMENT_PATTERN.test(congress)) return null;
  if (!BILL_TYPE_PATH_SEGMENTS.has(type)) return null;
  if (!BILL_NUMBER_SEGMENT_PATTERN.test(number)) return null;

  return { congress, type, number };
}
