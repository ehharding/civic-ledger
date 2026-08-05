import {
  type CommitteeDirectoryQuery,
  DEFAULT_COMMITTEE_DIRECTORY_QUERY,
  parseCommitteeDirectoryQuery,
} from "@/lib/congress/committee-filter";
import {
  type CommitteeRecordsQuery,
  DEFAULT_COMMITTEE_RECORDS_QUERY,
  parseCommitteeRecordsQuery,
} from "@/lib/congress/committee-records";
import {
  DEFAULT_MEMBER_DIRECTORY_QUERY,
  type MemberDirectoryQuery,
  parseMemberDirectoryQuery,
} from "@/lib/congress/member-filter";
import { type BillDirectoryQuery, DEFAULT_BILL_DIRECTORY_QUERY, parseBillDirectoryQuery } from "@/lib/congress/search";

/**
 * Resolves each directory's shareable deep link from the request.
 *
 * All three directories in this app can be linked to in a particular state — a bill search, or a narrowed and reordered
 * roster of people or committees — and all three resolve that state here rather than in their own route, so they can't
 * drift apart on the one thing they genuinely share: how a query param is turned into a starting view.
 *
 * Every parser these delegate to is total, in the same sense `src/lib/api-query.ts` describes: an absent, malformed, or
 * stale param resolves to a usable default rather than to an error. A shared link is exactly the kind of URL that gets
 * hand-edited, truncated by a chat client, or opened a year later against a roster that has since changed, and none of
 * those should produce anything worse than the unfiltered page.
 *
 * @see docs/architecture.md, "A Narrowed Directory Is a Place, So It Has a URL".
 */

/**
 * A route's `searchParams`, in the shape Next.js hands it over.
 *
 * A repeated param (`?state=Ohio&state=Iowa`) arrives as an array, which is why nothing here reads a value directly.
 * @see readParam
 */
export type RouteSearchParams = Record<string, string | string[] | undefined>;

/**
 * Reads one param, collapsing the repeated-param case.
 *
 * @param params - The route's resolved search params.
 * @param name - The param to read.
 * @returns The value, the first of a repeated set, or `undefined` when absent. Taking the first is arbitrary but has to
 *   be *something*: a control that can hold one value has no way to honor two, and the alternative — rejecting the
 *   whole URL — turns a duplicated param into a broken page.
 */
function readParam(params: RouteSearchParams, name: string): string | undefined {
  const value: string | string[] | undefined = params[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Re-expresses a route's search params as a `URLSearchParams`.
 *
 * The bridge to {@link parseMemberDirectoryQuery}, which reads the address bar's own type so that the browser and this
 * route can share one reading of a `/members` URL. Repeated params collapse to their first value on exactly the rule
 * {@link readParam} already used, so this changes the shape of the input and nothing about how it is interpreted.
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
 * page still works; it just can't be pre-filled from the URL. @see the GitHub Pages section of the README.
 */
function canReadRequest(): boolean {
  return process.env.STATIC_EXPORT !== "true";
}

/**
 * Resolves the bill directory's `?q=` and `?stage=` deep link.
 *
 * Shared by both bill-directory routes (`/bills` and `/bills/[congress]`) so they stay in sync rather than each
 * re-implementing this guard.
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
 *   one the control will actually offer. @see parseJurisdictionFilter
 * @returns The starting filters and order. In a static export this is always the unfiltered default view.
 */
export async function resolveMemberDirectoryQuery(
  searchParams: Promise<RouteSearchParams>,
  knownJurisdictions: Iterable<string>,
): Promise<MemberDirectoryQuery> {
  if (!canReadRequest()) return DEFAULT_MEMBER_DIRECTORY_QUERY;

  const params: RouteSearchParams = await searchParams;

  return parseMemberDirectoryQuery(toSearchParams(params), knownJurisdictions);
}

/**
 * Resolves the committee directory's shareable view from the request.
 *
 * Takes no equivalent of the member directory's `knownJurisdictions`, because neither of this directory's facets is
 * derived from the data: chamber and committee type are both closed unions the app declares, so a stale `?type=` param
 * can be validated against the model itself rather than against the list in hand.
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
 * Resolves an individual committee page's record view from the request.
 *
 * The first deep link in this app that is not a directory's. The three above narrow a *list of records* down to the
 * ones a reader wants; this one selects among the collections hanging off a *single* record — which bills were referred
 * to this committee, which reports it published — and pages within them. What makes it the same kind of thing, and
 * worth resolving in the same module, is the property that mattered about the others: a committee page showing the
 * third page of its reports is a place, so it needs an address that brings someone back to it.
 *
 * The static-export behavior is deliberately the same as the directories': with no server at request time the page
 * renders its default view, which for a committee is the first page of its referred bills.
 *
 * @param searchParams - The route's `searchParams` promise, passed straight through from the page component.
 * @returns Which collection to show and how far into it. Not yet clamped to a page the collection actually has — that
 *   needs the committee's own counts, which only exist once its record has resolved. @see clampCommitteeRecordsPage.
 */
export async function resolveCommitteeRecordsQuery(
  searchParams: Promise<RouteSearchParams>,
): Promise<CommitteeRecordsQuery> {
  if (!canReadRequest()) return DEFAULT_COMMITTEE_RECORDS_QUERY;

  return parseCommitteeRecordsQuery(toSearchParams(await searchParams));
}
