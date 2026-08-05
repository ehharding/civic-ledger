import { parseEnumParam, toQueryString } from "@/lib/congress/directory-filter";
import type { LegislativeBill } from "@/lib/congress/types";

/**
 * The three collections Congress.gov counts alongside a committee — the bills referred to it, the reports it published,
 * and the nominations sent to it — as records a reader can actually read, plus the URL rules that make one of them a
 * place you can link to.
 *
 * The committee page used to print those three counts as bare figures, on the stated reasoning that the URLs the API
 * pairs them with are its own JSON endpoints and would 403 a reader who followed one. That reasoning was right about
 * the *links* and wrong about the *records*: the counts are reachable from the same key the rest of this app already
 * holds, so "Bills Referred: 10,205" can be a heading over the referrals themselves rather than a number a reader has
 * to take on faith.
 *
 * Pure and isomorphic, exactly as `committee-filter.ts` is, and for the same two reasons: the query-param rules are the
 * interesting part and deserve tests that don't render a component, and nothing here may drag the server-only adapter —
 * or the API key it reads — into a client bundle. The fetching lives in `committee-activity.ts`.
 *
 * ## What this deliberately does not claim
 *
 * **These collections are not published in any documented order.** Sampling `hsag00`'s 10,205 referrals across their
 * whole range gives update timestamps of 2015, 2021, 2016, 2016, 2016, 2019, 2026 — ascending overall and emphatically
 * not monotonic — while the same committee's reports run oldest-ish to newest and the Senate Judiciary Committee's
 * nominations run the *other way*, newest first. The endpoint also accepts a `sort` parameter and ignores it.
 *
 * So this app pages through the sequence Congress.gov publishes and says so, rather than labeling either end "most
 * recent". That is the same rule the rest of the adapter holds — @see `compareBillsByRecency`, which sorts the member
 * page's legislation rather than trusting the order it arrived in — applied to a case where the ordering *cannot* be
 * repaired locally, because a page of twelve records out of ten thousand carries no information about where it sits in
 * time. A claim this app can't keep is one it doesn't make.
 */

/**
 * The three record collections a committee accumulates.
 *
 * A closed union rather than free text because it is a URL param (`?records=reports`), a tab, and the discriminant of
 * {@link CommitteeRecords} all at once — three places a typo would fail differently and none of them loudly.
 *
 * Ordered as the page presents them, which is by how much they say about what a committee *does*: nearly every
 * committee has bills referred to it, most have published reports, and nominations are the Senate's alone.
 */
export const committeeRecordKinds = ["bills", "reports", "nominations"] as const;

export type CommitteeRecordKind = (typeof committeeRecordKinds)[number];

/**
 * Which collection a bare committee URL shows.
 *
 * Bills, because a referral is the thing that happens to a committee most often and the one the page's own closing
 * callout is about. It is also the only one of the three every chamber has — a House committee's nominations list is
 * always empty, and defaulting to a tab that is empty for half the site's committees would read as a broken page.
 */
export const DEFAULT_COMMITTEE_RECORD_KIND: CommitteeRecordKind = "bills";

/**
 * The tab label for each collection.
 *
 * These are the same words the counts were already printed under, kept deliberately: a reader who has seen "Bills
 * Referred" as a figure should recognize the tab that now opens it.
 */
export const committeeRecordKindLabels: Record<CommitteeRecordKind, string> = {
  bills: "Bills Referred",
  reports: "Reports Published",
  nominations: "Nominations Referred",
};

/**
 * What each collection *is*, in one sentence, for the line above the list.
 *
 * Each says what the record means and — for the two where it is easy to over-read — what it does not. A referral is the
 * beginning of a committee's consideration rather than a verdict on it, and a nomination reaching a committee says
 * nothing about whether it was ever voted on.
 */
export const committeeRecordKindDescriptions: Record<CommitteeRecordKind, string> = {
  bills:
    "Measures sent to this committee, and what the committee did with each. A referral means a bill was sent here to be considered — not that it was taken up, amended, or reported out.",
  reports:
    "Committee reports accompany a measure out of committee and explain what it does and why. Congress.gov identifies each by its citation rather than by a title.",
  nominations:
    "Presidential nominations referred to this committee for consideration. Only Senate committees receive them, so the House's and joint committees' lists are always empty.",
};

/**
 * How each collection reads in a sentence about its absence.
 *
 * Separate from {@link committeeRecordKindLabels} because a heading and a clause genuinely differ here: "Bills
 * Referred" is the right tab and "records no bills referred for this committee" is not a sentence anyone would write.
 * The same split, for the same reason, as `committeeTypeLabels` and `committeeTypeNounPhrases`.
 */
export const committeeRecordKindClauses: Record<CommitteeRecordKind, string> = {
  bills: "no bills referred to this committee",
  reports: "no reports published by this committee",
  nominations: "no nominations referred to this committee",
};

/**
 * One bill's relationship to this committee.
 *
 * The committee-bills endpoint publishes far less about a bill than the bill endpoints do — a congress, a type, a
 * number, a relationship, and a date, with **no title**. What it adds is the two fields no other endpoint carries:
 * *what this committee did with the measure* and *when*, which is the whole reason a committee's bill list is worth
 * reading rather than being a filtered view of `/bills`.
 *
 * `bill` is the missing half, filled in by a second lookup where one succeeds. @see fetchReferredBills for why it is
 * optional rather than required: a row that names a measure and links to it is still a usable row when the title lookup
 * fails, and dropping it would silently shorten a list whose length is stated right above it.
 */
export type CommitteeBillReferral = {
  congress: number;
  /** Upper-cased, as `LegislativeBill.type` is — e.g., `"HR"`. */
  type: string;
  number: string;
  /** e.g. `"Referred To"`, `"Reported By"`. Verbatim from Congress.gov; this app defines no vocabulary of its own. */
  relationship?: string;
  /** ISO 8601 timestamp of the action that created the relationship. */
  actionDate?: string;
  /** The measure's own record, when it could be looked up. Absent means "not fetched", never "no such bill". */
  bill?: LegislativeBill;
};

/**
 * One report the committee published.
 *
 * `citation` is the load-bearing field and the only one guaranteed present: `"H. Rept. 109-710"` is how the report is
 * named in the *Congressional Record*, in a bill's own history, and on Congress.gov's page for it. The rest is what the
 * list endpoint happens to carry beside it.
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
 * One page of one collection, as a discriminated union on {@link CommitteeRecordKind}.
 *
 * A union rather than three nullable arrays so the component renders exactly one list and the compiler proves it: with
 * three fields, "reports are showing but the bills array is populated" is a state the types permit and a `switch` has
 * to defend against. Here it cannot be constructed.
 */
export type CommitteeRecords = {
  [Kind in CommitteeRecordKind]: { kind: Kind; items: CommitteeRecordItem[Kind][] };
}[CommitteeRecordKind];

/**
 * Which record shape each collection holds.
 *
 * Stated as a map rather than left implicit in the union above, so {@link pageOfCommitteeRecords} can be generic over
 * the collection *and* have TypeScript keep its kind and its items correlated. Written as three separate union members,
 * a helper taking `Kind extends CommitteeRecordKind` sees `items` as "an array of any of the three", and reassembling a
 * record from it needs a cast that would defeat the point of discriminating them in the first place.
 */
type CommitteeRecordItem = {
  bills: CommitteeBillReferral;
  reports: CommitteeReport;
  nominations: CommitteeNomination;
};

/**
 * One resolved page of one collection: the records, and where they sit in the whole.
 *
 * Lives in this pure module rather than beside the fetcher that usually produces it, because the preview fixtures
 * produce one too — and a shape declared next to the live path and imported back by the fixtures would put a cycle
 * between the two, or an import of the server-only adapter into a module the client bundle can reach.
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
  /**
   * The request failed, which is *not* the same as the collection being empty.
   *
   * A committee that has published no reports and a committee whose reports could not be fetched both yield zero rows,
   * and telling a reader the first when the truth is the second is exactly the kind of quiet false claim this app is
   * built to avoid. @see CongressRequestResult, which draws the same distinction one layer down.
   */
  unavailable: boolean;
};

/**
 * Slices a complete collection down to a single page and reports where that page sits.
 *
 * For callers that already hold every record — the preview fixtures, and any future local source — as opposed to the
 * live path, which asks Congress.gov for one page and never sees the rest. Both produce the same
 * {@link CommitteeRecordsResult}, which is what keeps the component free of any idea where its records came from.
 *
 * Generic over the *kind* with the item type read through {@link CommitteeRecordItem}, which is what makes the two
 * parameters correlated at every call site: `pageOfCommitteeRecords("reports", referrals, 1)` does not compile. That
 * correlation is where the safety actually is, and it is checked on the way in.
 *
 * The one assertion is on the way out. TypeScript cannot see that an object literal built from a still-generic `Kind`
 * and its matching items satisfies the union — correlated *reads* through a shared key are understood, correlated
 * *construction* is not — so reassembling the record needs either this assertion or a three-branch switch with three
 * identical bodies. The assertion is the smaller lie: it restates a correspondence the signature above has already
 * proven, in the single place a record is built, rather than spreading a defensive branch over three.
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
 * How many records one page of a committee's collection holds.
 *
 * The same twelve as `DEFAULT_PAGE_SIZE` and `MEMBER_LEGISLATION_LIMIT`, and shared with them in spirit rather than in
 * code: this is also the number of upstream lookups a bills page issues to fill in its titles, so it is a request
 * budget as well as a reading length.
 * @see fetchReferredBills.
 */
export const COMMITTEE_RECORDS_PAGE_SIZE: number = 12;

/**
 * The furthest page this app will ask Congress.gov for.
 *
 * The committee-bills endpoint will happily answer an offset in the millions and spend real time doing it. The largest
 * collection observed is a little over ten thousand records, so this sits comfortably past every real list while
 * bounding what a hand-edited `?page=` can cost. Same reasoning, and the same shape, as `MAX_BILL_OFFSET` in
 * `src/lib/api-query.ts`.
 */
export const MAX_COMMITTEE_RECORDS_PAGE: number = 1_000;

/**
 * How many pages a collection of `total` records fills.
 *
 * @param total - The collection's record count, or `undefined` when Congress.gov didn't report one.
 * @returns The page count, at least `1`. An empty collection still has one page, because the page it has is the one
 *   that says it is empty — returning `0` would make "Page 1 of 0" reachable.
 */
export function committeeRecordsPageCount(total: number | undefined): number {
  if (total === undefined || !Number.isFinite(total) || total <= 0) return 1;

  return Math.max(1, Math.ceil(total / COMMITTEE_RECORDS_PAGE_SIZE));
}

/**
 * Holds a requested page inside the collection that exists.
 *
 * Separate from {@link parseCommitteeRecordsPage}, which cannot do this: the parser runs against the URL before
 * anything has been fetched, so it knows a page is a positive whole number but not whether the collection is that long.
 * This runs once the committee's own counts are in hand.
 *
 * @param page - The requested page, already parsed to a positive whole number.
 * @param total - The collection's record count, or `undefined` when Congress.gov didn't report one.
 * @returns A page that exists. A `?page=` past the end lands on the last page rather than on an empty list, which is
 *   what a truncated or stale shared link most often is.
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
 * The query-param names a committee page reads and writes.
 *
 * Named once, here, for exactly the reason `COMMITTEE_DIRECTORY_PARAMS` is: the route parses them out of the request
 * and the page's own tab and pager links write them back, and a param name typed twice is a link that looks right and
 * restores nothing.
 *
 * `records` rather than `tab` because it names the content and not the widget — the same URL should still read
 * correctly the day these stop being tabs.
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
 * Parses the `page` param.
 *
 * Hand-rolled rather than routed through `src/lib/api-query.ts`'s zod-backed parsers, and the direction of that
 * dependency is the reason: this module is isomorphic and the committee page's tab links are built in the browser as
 * well as on the server, so importing schema validation here would pull zod into the client bundle behind it. The rule
 * being applied is the same one — parse, don't trust, and resolve every input to something usable.
 *
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @returns A whole number between `1` and {@link MAX_COMMITTEE_RECORDS_PAGE}. Absent, non-numeric, zero, negative, and
 *   fractional values all resolve to the first page; an absurdly large one is clamped rather than sent upstream.
 */
export function parseCommitteeRecordsPage(raw: string | null | undefined): number {
  const value: number = Number((raw ?? "").trim());

  if (!Number.isFinite(value)) return 1;

  return Math.min(MAX_COMMITTEE_RECORDS_PAGE, Math.max(1, Math.trunc(value)));
}

/**
 * Reads a committee page's whole record view out of a URL's query string.
 *
 * The exact counterpart to {@link committeeRecordsQueryString}, and — as with the three directories — both sides of the
 * boundary go through it, so a route and a link cannot drift into disagreeing about what a URL means.
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
 * Serializes a record view back into a query string.
 *
 * Only non-default values are written, on the same contract every directory serializer in this app holds: a committee
 * page showing the first page of its bills has a clean `/committees/house/hsag00` URL rather than one carrying two
 * params that both say "the default". Param order is fixed rather than incidental, so the same view always produces the
 * same string — which is what makes these links comparable, cacheable, and stable in history.
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
 * How one record collection's page reads in the line above it.
 *
 * Lives here rather than in the component on the rule the whole committee model follows: what a reader is told about a
 * committee is display wording, so it belongs somewhere a unit test can reach it without rendering a page.
 *
 * The wording is careful about one thing in particular. It says which *slice of the published sequence* is on screen,
 * never that it is the newest or the oldest — @see this module's header for the sampling that rules that claim out.
 *
 * @param options - The record count, and where in it this page sits.
 * @returns e.g., `"Showing 13–24 of 10,205, in the order Congress.gov publishes them."` For a collection that fits on
 *   one page, the ordering clause is dropped: a sequence with nothing after it is not a sequence a reader has to reason
 *   about.
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

  if (known <= COMMITTEE_RECORDS_PAGE_SIZE) return `${shown.toLocaleString("en-US")} on file.`;

  return `Showing ${first.toLocaleString("en-US")}–${last.toLocaleString("en-US")} of ${known.toLocaleString("en-US")}, in the order Congress.gov publishes them.`;
}
