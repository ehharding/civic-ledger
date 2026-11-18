import {
  type BillDirectoryQuery,
  DEFAULT_BILL_DIRECTORY_QUERY,
  parseBillDirectoryQuery,
} from "@/lib/congress/bills/search";
import {
  type CommitteeDirectoryQuery,
  DEFAULT_COMMITTEE_DIRECTORY_QUERY,
  parseCommitteeDirectoryQuery,
} from "@/lib/congress/committees/filter";
import {
  type CommitteeRecordsQuery,
  DEFAULT_COMMITTEE_RECORDS_QUERY,
  parseCommitteeRecordsQuery,
} from "@/lib/congress/committees/records";
import {
  DEFAULT_MEMBER_DIRECTORY_QUERY,
  type MemberDirectoryQuery,
  parseMemberDirectoryQuery,
} from "@/lib/congress/members/filter";

/**
 * Resolves each directory's (and a committee page's) shareable view from the request, in one place. Every parser is
 * total: an absent, malformed, or stale param resolves to a default rather than an error.
 *
 * @see docs/architecture.md, "A Narrowed Directory Is a Place, So It Has a URL".
 */

/**
 * A route's `searchParams`, in the shape Next.js hands it over.
 *
 * A repeated param (`?state=Ohio&state=Iowa`) arrives as an array, which is why nothing here reads a value directly.
 *
 * @see readParam
 */
export type RouteSearchParams = Record<string, string | string[] | undefined>;

/**
 * An empty query, as the already-resolved promise a route's renderer takes.
 *
 * What a static route hands its renderer in place of the request's own `searchParams`. Reading the real ones is what
 * makes a route render on every request, so the static half of each query-aware route never touches them and renders
 * the default view from this instead; its `/query` twin passes the real ones through.
 *
 * @see src/lib/query-routes.ts
 */
export const NO_SEARCH_PARAMS: Promise<RouteSearchParams> = Promise.resolve({});

/**
 * Reads one param, collapsing the repeated-param case.
 *
 * @param params - The route's resolved search params.
 * @param name - The param to read.
 * @returns The value, the first of a repeated set, or `undefined` when absent.
 */
function readParam(params: RouteSearchParams, name: string): string | undefined {
  const value: string | string[] | undefined = params[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Re-expresses a route's search params as a `URLSearchParams`, for parsers shared with the browser. Repeated params
 * collapse to their first value, as in {@link readParam}.
 *
 * @param params - The route's resolved search params.
 * @returns The same params, in the shape a URL carries them.
 */
function toSearchParams(params: RouteSearchParams): URLSearchParams {
  const search: URLSearchParams = new URLSearchParams();

  for (const name of Object.keys(params)) {
    const value: string | undefined = readParam(params, name);
    if (value !== undefined) search.set(name, value);
  }

  return search;
}

/**
 * Whether the running build can read a request URL at all.
 *
 * A static export has no server left at request time, so every deep link below degrades to the page's default view. The
 * page still works; it just can't be pre-filled from the URL.
 *
 * @returns `false` in the static export, `true` everywhere else.
 * @see docs/deployment.md, "Secondary: GitHub Pages Static Demo".
 */
function canReadRequest(): boolean {
  return process.env.STATIC_EXPORT !== "true";
}

/**
 * Resolves the bill directory's `?q=` and `?stage=` deep link, for both `/bills` and `/bills/[congress]`.
 *
 * @param searchParams - The route's `searchParams` promise, passed straight through from the page component.
 * @returns The starting search and stage filter. In a static export, or for a URL carrying neither param, this is an
 *   empty search across all stages.
 */
export async function resolveBillDirectoryQuery(searchParams: Promise<RouteSearchParams>): Promise<BillDirectoryQuery> {
  if (!canReadRequest()) return DEFAULT_BILL_DIRECTORY_QUERY;

  return parseBillDirectoryQuery(toSearchParams(await searchParams));
}

/**
 * Resolves the member directory's shareable view from the request.
 *
 * @param searchParams - The route's `searchParams` promise, passed straight through from the page component.
 * @param knownJurisdictions - The jurisdictions present in the roster being rendered, so `?state=` can only resolve to
 *   one the control will actually offer.
 * @returns The starting filters and order. In a static export this is always the unfiltered default view.
 * @see parseJurisdictionFilter
 */
export async function resolveMemberDirectoryQuery(
  searchParams: Promise<RouteSearchParams>,
  knownJurisdictions: Iterable<string>,
): Promise<MemberDirectoryQuery> {
  if (!canReadRequest()) return DEFAULT_MEMBER_DIRECTORY_QUERY;

  return parseMemberDirectoryQuery(toSearchParams(await searchParams), knownJurisdictions);
}

/**
 * Resolves the committee directory's shareable view. Both facets are closed unions, so no data is needed to validate
 * them.
 *
 * @param searchParams - The route's `searchParams` promise, passed straight through from the page component.
 * @returns The starting filters and order. In a static export this is always the unfiltered default view.
 */
export async function resolveCommitteeDirectoryQuery(
  searchParams: Promise<RouteSearchParams>,
): Promise<CommitteeDirectoryQuery> {
  if (!canReadRequest()) return DEFAULT_COMMITTEE_DIRECTORY_QUERY;

  return parseCommitteeDirectoryQuery(toSearchParams(await searchParams));
}

/**
 * Resolves a committee page's record view (which collection, which page). A static export renders the default view.
 *
 * @param searchParams - The route's `searchParams` promise, passed straight through from the page component.
 * @returns Which collection to show and how far into it. Not yet clamped to a page the collection actually has — that
 *   needs the committee's own counts, which only exist once its record has resolved.
 * @see clampCommitteeRecordsPage
 */
export async function resolveCommitteeRecordsQuery(
  searchParams: Promise<RouteSearchParams>,
): Promise<CommitteeRecordsQuery> {
  if (!canReadRequest()) return DEFAULT_COMMITTEE_RECORDS_QUERY;

  return parseCommitteeRecordsQuery(toSearchParams(await searchParams));
}
