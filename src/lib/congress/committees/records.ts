import type { LegislativeBill } from "@/lib/congress/bills/model";
import type { CommitteeProfile } from "@/lib/congress/committees/model";
import { parseEnumParam, toQueryString } from "@/lib/congress/directory-filter";
import { formatCount } from "@/lib/format";

/**
 * The three collections Congress.gov counts on a committee — referred bills, published reports, and nominations — as
 * readable, linkable pages of records rather than bare counts. Pure and isomorphic so the URL rules can be tested
 * without rendering and nothing pulls the server adapter into the client. Fetching lives in `activity.ts`.
 *
 * **These collections have no reliable order.** Sampled referrals are roughly but not strictly ascending, reports
 * differ, Senate nominations run newest first, and the endpoint ignores `sort`. A page of twelve out of ten thousand
 * can't be re-sorted locally, so the app pages through the published sequence and says so, never claiming "most
 * recent".
 */

/**
 * The three record collections a committee accumulates — a URL param (`?records=reports`), a tab, and the discriminant
 * of {@link CommitteeRecords}. In page order: nearly every committee has referrals, most have reports, and only Senate
 * committees have nominations.
 */
export const committeeRecordKinds = ["bills", "reports", "nominations"] as const;

export type CommitteeRecordKind = (typeof committeeRecordKinds)[number];

/** Which collection a bare committee URL shows: bills, the only one every chamber's committees have. */
export const DEFAULT_COMMITTEE_RECORD_KIND: CommitteeRecordKind = "bills";

/**
 * The tab label for each collection.
 *
 * Each names the relationship rather than the record type — a committee has bills *referred to* it and publishes
 * reports *of its own*, and a tab reading "Bills" would flatten that distinction into a filter of `/bills`.
 */
export const committeeRecordKindLabels: Record<CommitteeRecordKind, string> = {
  bills: "Bills Referred",
  reports: "Reports Published",
  nominations: "Nominations Referred",
};

/**
 * What each collection *is*, for the line above the list — including, where it's easy to over-read, what it isn't (a
 * referral isn't a verdict; a nomination reaching a committee says nothing about a vote).
 */
export const committeeRecordKindDescriptions: Record<CommitteeRecordKind, string> = {
  bills:
    "Measures sent to this committee, and what the committee did with each. A referral means a bill was sent here to be considered — not that it was taken up, amended, or reported out.",
  reports:
    "Committee reports accompany a measure out of committee and explain what it does and why. Congress.gov identifies each by its citation rather than by a title.",
  nominations:
    "Presidential nominations referred to this committee for consideration. Only Senate committees receive them, so the House's and joint committees' lists are always empty.",
};

/** How each collection reads in a sentence about its absence, which differs from its tab label. */
export const committeeRecordKindClauses: Record<CommitteeRecordKind, string> = {
  bills: "no bills referred to this committee",
  reports: "no reports published by this committee",
  nominations: "no nominations referred to this committee",
};

/**
 * The count the committee's *own* record reports for one collection. Used by the route (to clamp the page before
 * fetching — @see clampCommitteeRecordsPage) and by the tabs not currently open. Where a collection was fetched, its
 * endpoint's count wins. @see countFor in `committee-records.tsx`
 *
 * @param profile - The committee whose counts to read.
 * @param kind - Which collection.
 * @returns The count, or `undefined` when Congress.gov reported none for it — a different claim from "none", and one
 *   every caller has to keep distinct from zero.
 */
export function committeeReportedCount(profile: CommitteeProfile, kind: CommitteeRecordKind): number | undefined {
  if (kind === "bills") return profile.billCount;
  if (kind === "reports") return profile.reportCount;

  return profile.nominationCount;
}

/**
 * One bill's relationship to this committee: what the committee did with it and when, which no other endpoint carries.
 * The endpoint omits titles, so `bill` is filled by a second lookup and stays optional — a row still names and links
 * the measure if that lookup fails. @see withBillTitles
 */
export type CommitteeBillReferral = {
  congress: number;
  /** Upper-cased, as `LegislativeBill.type` is — e.g., `"HR"`. */
  type: string;
  number: string;
  /** e.g., `"Referred To"`, `"Reported By"`. Verbatim from Congress.gov; this app defines no vocabulary of its own. */
  relationship?: string;
  /** ISO 8601 timestamp of the action that created the relationship. */
  actionDate?: string;
  /** The measure's own record, when it could be looked up. Absent means "not fetched", never "no such bill". */
  bill?: LegislativeBill;
};

/**
 * One report the committee published. Only `citation` (`"H. Rept. 109-710"`, the form used everywhere the report is
 * named) is guaranteed.
 */
export type CommitteeReport = {
  /** e.g., `"H. Rept. 109-710"` — how Congress.gov names this report. Never empty. */
  citation: string;
  congress?: number;
  /** e.g., `"HRPT"`. The report-series code, not a bill type. */
  type?: string;
  number?: number;
  /** Reports issued in parts carry one; most don't. */
  part?: number;
  /** ISO 8601 timestamp of Congress.gov's last change to the record — not the date the report was issued. */
  updateDate?: string;
};

/**
 * One nomination referred to the committee.
 *
 * The richest of the three: unlike bills and reports, the nominations endpoint publishes a full `description` inline,
 * so these rows say who was nominated to what without a second request.
 */
export type CommitteeNomination = {
  /** e.g., `"PN1201-7"` — the printed nomination number. Never empty. */
  citation: string;
  congress?: number;
  /** e.g., "Jane Doe, of Ohio, to be United States Marshal for…". Verbatim. */
  description?: string;
  /** ISO 8601 date the Senate received the nomination. */
  receivedDate?: string;
  latestAction?: {
    date?: string;
    text?: string;
  };
};

/**
 * One page of one collection, discriminated on {@link CommitteeRecordKind} so a mismatched kind and list can't be
 * constructed.
 */
export type CommitteeRecords = {
  [Kind in CommitteeRecordKind]: { kind: Kind; items: CommitteeRecordItem[Kind][] };
}[CommitteeRecordKind];

/** Which record shape each collection holds, so {@link pageOfCommitteeRecords} can keep kind and items correlated. */
type CommitteeRecordItem = {
  bills: CommitteeBillReferral;
  reports: CommitteeReport;
  nominations: CommitteeNomination;
};

/**
 * One resolved page of one collection: the records, and where they sit in the whole. Here rather than beside the
 * fetcher because the preview fixtures produce one too.
 */
export type CommitteeRecordsResult = {
  /** The page's records, discriminated by which collection they came from. */
  records: CommitteeRecords;
  /** The page actually shown, 1-based and already clamped to a page that exists. */
  page: number;
  /** How many pages the collection fills. At least `1`, even when empty. */
  pageCount: number;
  /** Congress.gov's own count for the whole collection, or `undefined` when it reported none. */
  total: number | undefined;
  /** The request failed — not the same as an empty collection, though both yield zero rows. */
  unavailable: boolean;
};

/**
 * Slices a complete collection (the preview fixtures' case) down to one page, producing the same result shape as the
 * live path.
 *
 * The signature correlates `kind` and `items`, so `pageOfCommitteeRecords("reports", referrals, 1)` doesn't compile.
 * The assertion on the way out restates that correlation, which TypeScript can't see when constructing the union.
 *
 * @typeParam Kind - Which collection this is.
 * @param kind - The collection's discriminant.
 * @param items - Every record in it. Must be the item type `kind` names.
 * @param page - The requested 1-based page, not yet clamped.
 * @returns The requested page, clamped to one that exists.
 */
export function pageOfCommitteeRecords<Kind extends CommitteeRecordKind>(
  kind: Kind,
  items: CommitteeRecordItem[Kind][],
  page: number,
): CommitteeRecordsResult {
  const total: number = items.length;
  const clamped: number = clampCommitteeRecordsPage(page, total);
  const start: number = committeeRecordsOffset(clamped);
  const shown: CommitteeRecordItem[Kind][] = items.slice(start, start + COMMITTEE_RECORDS_PAGE_SIZE);

  return {
    records: { kind, items: shown } as CommitteeRecords,
    page: clamped,
    pageCount: committeeRecordsPageCount(total),
    total,
    unavailable: false,
  };
}

/**
 * How many records one page of a committee's collection holds — also the number of title lookups a bills page issues,
 * so it's a request budget too. @see withBillTitles
 */
export const COMMITTEE_RECORDS_PAGE_SIZE: number = 12;

/**
 * The furthest page this app requests — well past the largest real collection (~10,000 records), while bounding what a
 * hand-edited `?page=` can cost. @see MAX_BILL_OFFSET
 */
export const MAX_COMMITTEE_RECORDS_PAGE: number = 1_000;

/**
 * How many pages a collection of `total` records fills.
 *
 * @param total - The collection's record count, or `undefined` when Congress.gov didn't report one.
 * @returns The page count, at least `1` — an empty collection still has the page that says it's empty.
 */
export function committeeRecordsPageCount(total: number | undefined): number {
  if (total === undefined || !Number.isFinite(total) || total <= 0) return 1;

  return Math.max(1, Math.ceil(total / COMMITTEE_RECORDS_PAGE_SIZE));
}

/**
 * Holds a requested page inside the collection, once its count is known (the URL parser runs before that).
 *
 * @param page - The requested page, already parsed to a positive whole number.
 * @param total - The collection's record count, or `undefined` when Congress.gov didn't report one.
 * @returns A page that exists; a `?page=` past the end (often a stale link) lands on the last page.
 */
export function clampCommitteeRecordsPage(page: number, total: number | undefined): number {
  return Math.min(Math.max(1, page), committeeRecordsPageCount(total));
}

/**
 * The offset a given page starts at, for the upstream request.
 *
 * @param page - A 1-based page number, already clamped.
 * @returns The 0-based record offset.
 */
export function committeeRecordsOffset(page: number): number {
  return (Math.max(1, page) - 1) * COMMITTEE_RECORDS_PAGE_SIZE;
}

/**
 * The query-param names a committee page reads and writes, named once so parsing and link-building agree. `records`
 * names the content rather than the widget.
 */
export const COMMITTEE_RECORDS_PARAMS = {
  kind: "records",
  page: "page",
} as const;

/** Everything a committee page's URL can express beyond which committee it is: what to show, and how far in. */
export type CommitteeRecordsQuery = {
  kind: CommitteeRecordKind;
  /** 1-based. Not yet clamped to the collection — @see clampCommitteeRecordsPage. */
  page: number;
};

/** The first page of the default collection — what a bare `/committees/house/hsag00` means. */
export const DEFAULT_COMMITTEE_RECORDS_QUERY: CommitteeRecordsQuery = {
  kind: DEFAULT_COMMITTEE_RECORD_KIND,
  page: 1,
};

/**
 * Parses the `records` param.
 *
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @returns The named collection, or {@link DEFAULT_COMMITTEE_RECORD_KIND} for anything unrecognized.
 */
export function parseCommitteeRecordKind(raw: string | null | undefined): CommitteeRecordKind {
  return parseEnumParam(raw, committeeRecordKinds, DEFAULT_COMMITTEE_RECORD_KIND);
}

/**
 * Parses the `page` param. Hand-rolled rather than zod-backed, since this module also runs in the browser.
 *
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @returns A whole number between `1` and {@link MAX_COMMITTEE_RECORDS_PAGE}; anything invalid resolves to `1`, and an
 *   oversized value is clamped.
 */
export function parseCommitteeRecordsPage(raw: string | null | undefined): number {
  const value: number = Number((raw ?? "").trim());

  if (!Number.isFinite(value)) return 1;

  return Math.min(MAX_COMMITTEE_RECORDS_PAGE, Math.max(1, Math.trunc(value)));
}

/**
 * Reads a committee page's record view out of a URL's query string — the inverse of
 * {@link committeeRecordsQueryString}.
 *
 * @param params - The query string to read, already parsed.
 * @returns The view the URL asks for. Total: an absent, malformed, or stale param resolves to a usable default.
 */
export function parseCommitteeRecordsQuery(params: URLSearchParams): CommitteeRecordsQuery {
  return {
    kind: parseCommitteeRecordKind(params.get(COMMITTEE_RECORDS_PARAMS.kind)),
    page: parseCommitteeRecordsPage(params.get(COMMITTEE_RECORDS_PARAMS.page)),
  };
}

/**
 * Serializes a record view back into a query string, writing only non-default values in a fixed order so the default
 * view has a clean URL and each view has exactly one.
 *
 * @param query - The view to serialize.
 * @returns The query string including its leading `?`, or an empty string for the default view.
 */
export function committeeRecordsQueryString(query: CommitteeRecordsQuery): string {
  const params: URLSearchParams = new URLSearchParams();

  if (query.kind !== DEFAULT_COMMITTEE_RECORD_KIND) params.set(COMMITTEE_RECORDS_PARAMS.kind, query.kind);
  if (query.page > 1) params.set(COMMITTEE_RECORDS_PARAMS.page, String(query.page));

  return toQueryString(params);
}

/**
 * How one page of a collection reads in the line above it — which slice of the published sequence is shown, never
 * "newest" or "oldest" (see this module's header).
 *
 * @param options - The record count, and where in it this page sits.
 * @returns e.g., `"Showing 13–24 of 10,205, in the order Congress.gov publishes them."`; the ordering clause is dropped
 *   when everything fits on one page.
 */
export function describeCommitteeRecordsPage(options: {
  shown: number;
  page: number;
  total: number | undefined;
}): string {
  const { shown, page, total } = options;

  if (shown === 0) return "";

  const first: number = committeeRecordsOffset(page) + 1;
  const last: number = first + shown - 1;
  const known: number = total ?? last;

  if (known <= COMMITTEE_RECORDS_PAGE_SIZE) return `${formatCount(shown)} on file.`;

  return `Showing ${formatCount(first)}–${formatCount(last)} of ${formatCount(known)}, in the order Congress.gov publishes them.`;
}
