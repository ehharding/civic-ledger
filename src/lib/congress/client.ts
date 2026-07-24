import { getCurrentCongress } from "@/lib/congress/current-congress";
import { billIdentityKey, previewBills, previewSummaries } from "@/lib/congress/fixtures";
import { sanitizeSummaryHtml } from "@/lib/congress/sanitize-summary";
import { inferBillStage } from "@/lib/congress/stage";
import {
  type BillSponsor,
  type BillSummary,
  type BillTextFormat,
  type BillTextVersion,
  type CongressSnapshot,
  DEFAULT_PAGE_SIZE,
  type LegislativeBill,
} from "@/lib/congress/types";

/** Shape of one entry in a detail-endpoint bill's `sponsors` array. */
type CongressApiSponsor = {
  bioguideId?: string;
  fullName?: string;
  party?: string;
  state?: string;
};

/**
 * Subset of a Congress.gov API bill object actually used by this app — both the list and detail endpoint shapes, since
 * mapCongressBill handles either.
 */
type CongressApiBill = {
  congress?: number;
  // The list endpoint uses `type`/`number`; the single-bill detail endpoint uses `billType`/`billNumber`.
  // Both are accepted so one mapper covers both.
  type?: string;
  billType?: string;
  number?: string | number;
  billNumber?: string | number;
  title?: string;
  originChamber?: string;
  introducedDate?: string;
  updateDate?: string;
  url?: string;
  policyArea?: { name?: string };
  latestAction?: { actionDate?: string; text?: string };
  // Only populated on the detail endpoint — the list endpoint doesn't return either field.
  sponsors?: CongressApiSponsor[];
  cosponsors?: { count?: number };
};

/** Shape of GET /v3/bill (the list endpoint). */
type CongressApiListResponse = {
  bills?: CongressApiBill[];
};

/** Shape of GET /v3/bill/{congress}/{type}/{number} (the single-bill detail endpoint). */
type CongressApiDetailResponse = {
  bill?: CongressApiBill;
};

/** Shape of GET /v3/bill/{congress}/{type}/{number}/summaries. */
type CongressApiSummary = {
  versionCode?: string;
  actionDesc?: string;
  actionDate?: string;
  text?: string;
};

type CongressApiSummariesResponse = {
  summaries?: CongressApiSummary[];
};

/** Shape of GET /v3/bill/{congress}/{type}/{number}/text. */
type CongressApiTextFormat = {
  type?: string;
  url?: string;
};

type CongressApiTextVersion = {
  type?: string;
  date?: string;
  formats?: CongressApiTextFormat[];
};

type CongressApiTextResponse = {
  textVersions?: CongressApiTextVersion[];
};

/**
 * Narrows an arbitrary API string to the app's closed originChamber union, defaulting to "Unknown" for anything
 * unexpected.
 */
function asOriginChamber(value?: string): LegislativeBill["originChamber"] {
  if (value === "House" || value === "Senate") return value;
  return "Unknown";
}

/**
 * Maps a raw Congress.gov API bill (list- or detail-shaped) into the app's stable LegislativeBill type.
 * Returns `null` when the record is missing a field the app actually depends on, so callers can filter incomplete
 * records out rather than rendering a broken card.
 */
function mapCongressBill(bill: CongressApiBill): LegislativeBill | null {
  const type: string | undefined = bill.type ?? bill.billType;
  const number: string | number | undefined = bill.number ?? bill.billNumber;

  if (!bill.congress || !bill.title || !type || !number) return null;

  const actionText: string = bill.latestAction?.text ?? "No action text has been published yet.";
  const sponsor: CongressApiSponsor | undefined = bill.sponsors?.[0];

  return {
    congress: bill.congress,
    type: type.toUpperCase(),
    number: String(number),
    title: bill.title,
    originChamber: asOriginChamber(bill.originChamber),
    introducedDate: bill.introducedDate,
    latestAction: {
      date: bill.latestAction?.actionDate ?? bill.updateDate,
      text: actionText,
    },
    policyArea: bill.policyArea?.name,
    stage: inferBillStage(actionText),
    officialUrl: bill.url ?? "https://www.congress.gov/",
    sponsor: sponsor?.fullName
      ? ({
          fullName: sponsor.fullName,
          party: sponsor.party,
          state: sponsor.state,
          bioguideId: sponsor.bioguideId,
        } satisfies BillSponsor)
      : undefined,
    cosponsorCount: bill.cosponsors?.count,
  };
}

/**
 * Maps a raw summaries-endpoint entry into the app's BillSummary shape. Returns `null` when the record is missing text
 * or an action description, so callers can filter incomplete records out.
 */
function mapCongressSummary(summary: CongressApiSummary): BillSummary | null {
  if (!summary.text || !summary.actionDesc) return null;

  return {
    versionCode: summary.versionCode ?? "00",
    actionDesc: summary.actionDesc,
    actionDate: summary.actionDate,
    html: sanitizeSummaryHtml(summary.text),
  };
}

/**
 * Maps a raw text-endpoint entry into the app's BillTextVersion shape. Returns `null` when the record is missing a type
 * or has no usable formats, so callers can filter incomplete records out.
 */
function mapCongressTextVersion(version: CongressApiTextVersion): BillTextVersion | null {
  if (!version.type) return null;

  const formats: BillTextFormat[] = (version.formats ?? []).filter(
    (format: CongressApiTextFormat): format is BillTextFormat => Boolean(format.type && format.url),
  );
  if (formats.length === 0) return null;

  return { type: version.type, date: version.date, formats };
}

/**
 * Sorts summaries by `actionDate`, most recent first, so callers can treat the first entry as "the bill as it stands
 * now." Entries without a date sort last. Plain string comparison is enough since summaries' `actionDate`
 * (`YYYY-MM-DD`) sorts correctly as a string.
 */
function sortSummariesByDateDesc(summaries: BillSummary[]): BillSummary[] {
  return [...summaries].sort((a: BillSummary, b: BillSummary): number =>
    (b.actionDate ?? "").localeCompare(a.actionDate ?? ""),
  );
}

/**
 * Sorts text versions by `date`, most recent first. Entries without a date sort last. Plain string comparison is enough
 * since text versions' `date` is a full ISO 8601 timestamp, which also sorts correctly as a string.
 */
function sortTextVersionsByDateDesc(versions: BillTextVersion[]): BillTextVersion[] {
  return [...versions].sort((a: BillTextVersion, b: BillTextVersion): number =>
    (b.date ?? "").localeCompare(a.date ?? ""),
  );
}

/**
 * Locates a matching fixture in previewBills by natural bill identifier. Used both as the no-key path and as a
 * last-resort fallback when a live lookup fails.
 */
function findPreviewBill(input: { congress: string; type: string; number: string }): LegislativeBill | undefined {
  return previewBills.find(
    (bill) =>
      bill.congress === Number(input.congress) &&
      bill.type.toLowerCase() === input.type.toLowerCase() &&
      bill.number === input.number,
  );
}

/**
 * Fetches one page of the bill list for a specific Congress. Returns `null` on any failure so callers can decide
 * how to fall back (preview data for the homepage, an empty page for "load more").
 *
 * Filtered explicitly by congress via the URL path (a documented filter — see BillEndpoint.md) rather than calling
 * the unfiltered `/v3/bill` list. That unfiltered list isn't sorted by congress number or introduction date, so it
 * can surface bills from any Congress in the API's history depending on which records happened to update recently;
 * filtering by congress guarantees every bill returned actually belongs to the one requested.
 */
async function fetchBillsPage(input: {
  apiKey: string;
  offset: number;
  limit: number;
  congress: number;
}): Promise<LegislativeBill[] | null> {
  const url: URL = new URL(`https://api.congress.gov/v3/bill/${input.congress}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(input.limit));
  url.searchParams.set("offset", String(input.offset));
  url.searchParams.set("api_key", input.apiKey);

  try {
    const response: Response = await fetch(url, {
      next: { revalidate: 300, tags: ["congress-bills"] },
      headers: { Accept: "application/json" },
    });

    if (!response.ok) throw new Error(`Congress.gov responded with ${response.status}`);

    const payload = (await response.json()) as CongressApiListResponse;
    const bills: LegislativeBill[] = (payload.bills ?? [])
      .map(mapCongressBill)
      .filter((bill: LegislativeBill | null): bill is LegislativeBill => bill !== null);

    return bills;
  } catch (error) {
    console.error("[congress] Failed to fetch the live bill list, falling back to preview data:", error);
    return null;
  }
}

/**
 * Fetches the first page of the current Congress's bills for the homepage and bill directory.
 *
 * Falls back to the labeled preview fixtures whenever live data isn't available — no `CONGRESS_API_KEY` configured, or
 * the upstream request fails/returns nothing. Callers should read `source` on the returned snapshot rather than
 * assuming success; this function never throws.
 */
export async function getCongressSnapshot(): Promise<CongressSnapshot> {
  const apiKey: string | undefined = process.env.CONGRESS_API_KEY;
  const retrievedAt: string = new Date().toISOString();

  if (!apiKey) {
    return {
      bills: previewBills,
      source: "preview",
      retrievedAt,
      notice: "Preview records are shown until a server-only Congress.gov API key is configured.",
    };
  }

  const bills: LegislativeBill[] | null = await fetchBillsPage({
    apiKey,
    offset: 0,
    limit: DEFAULT_PAGE_SIZE,
    congress: getCurrentCongress(),
  });

  if (!bills || bills.length === 0) {
    return {
      bills: previewBills,
      source: "preview",
      retrievedAt,
      notice: "Live records are temporarily unavailable, so preview records are shown.",
    };
  }

  return { bills, source: "live", retrievedAt };
}

/**
 * Fetches an additional page of live bills for "load more" pagination.
 * Only meaningful when a live key is configured; returns an empty page otherwise so the UI can simply stop offering
 * more results.
 */
export async function getMoreBills(offset: number): Promise<LegislativeBill[]> {
  const apiKey: string | undefined = process.env.CONGRESS_API_KEY;
  if (!apiKey) return [];

  const bills: LegislativeBill[] | null = await fetchBillsPage({
    apiKey,
    offset,
    limit: DEFAULT_PAGE_SIZE,
    congress: getCurrentCongress(),
  });

  return bills ?? [];
}

/** What getBillById actually resolved: the bill (if any), and whether that came from live or preview data. */
export type BillLookupResult = {
  bill: LegislativeBill | undefined;
  source: CongressSnapshot["source"];
  notice?: string;
};

/**
 * Looks up a single bill directly, rather than searching only the first page of the list snapshot.
 * This lets any real bill resolve correctly, not just the dozen most recently returned by the list endpoint.
 *
 * Also reports the source (live/preview) the result actually came from, so callers — namely the bill detail page — can
 * render an accurate DataSourceNotice without a second, separate snapshot fetch.
 */
export async function getBillById(input: {
  congress: string;
  type: string;
  number: string;
}): Promise<BillLookupResult> {
  const apiKey: string | undefined = process.env.CONGRESS_API_KEY;

  if (!apiKey) {
    return { bill: findPreviewBill(input), source: "preview" };
  }

  const url: URL = new URL(
    `https://api.congress.gov/v3/bill/${input.congress}/${input.type.toLowerCase()}/${input.number}`,
  );
  url.searchParams.set("format", "json");
  url.searchParams.set("api_key", apiKey);

  try {
    const response: Response = await fetch(url, {
      next: {
        revalidate: 300,
        tags: ["congress-bills", `bill-${input.congress}-${input.type}-${input.number}`],
      },
      headers: { Accept: "application/json" },
    });

    if (response.status === 404) return { bill: undefined, source: "live" };
    if (!response.ok) throw new Error(`Congress.gov responded with ${response.status}`);

    const payload = (await response.json()) as CongressApiDetailResponse;
    const bill: LegislativeBill | null = payload.bill ? mapCongressBill(payload.bill) : null;

    return { bill: bill ?? undefined, source: "live" };
  } catch (error) {
    // A transient failure shouldn't be indistinguishable from "not found"; fall back to a snapshot search, then to
    // preview data as a last resort.
    console.error("[congress] Direct bill lookup failed, falling back to a snapshot search:", error);
    const snapshot: CongressSnapshot = await getCongressSnapshot();
    const bill: LegislativeBill | undefined =
      snapshot.bills.find(
        (candidate) =>
          candidate.congress === Number(input.congress) &&
          candidate.type.toLowerCase() === input.type.toLowerCase() &&
          candidate.number === input.number,
      ) ?? findPreviewBill(input);

    return { bill, source: snapshot.source, notice: snapshot.notice };
  }
}

/**
 * Fetches every CRS summary on file for a bill, most recent first. A bill can have several — one per stage it's reached
 * (introduced, reported, passed, etc.) — since the text, and so the summary, can change at each stage.
 *
 * Falls back to a single labeled, fictional preview summary when no API key is configured (see `previewSummaries`),
 * and to an empty list on any live-request failure — the caller renders that as "no summary published yet" rather than
 * an error, since that's also a real, valid state for a newly introduced bill.
 */
export async function getBillSummaries(input: {
  congress: string;
  type: string;
  number: string;
}): Promise<BillSummary[]> {
  const apiKey: string | undefined = process.env.CONGRESS_API_KEY;

  if (!apiKey) {
    const text: string | undefined = previewSummaries[billIdentityKey(input)];
    if (!text) return [];

    return [
      {
        versionCode: "00",
        actionDesc: "Preview Summary",
        actionDate: findPreviewBill(input)?.introducedDate,
        html: sanitizeSummaryHtml(`<p>${text}</p>`),
      },
    ];
  }

  const url: URL = new URL(
    `https://api.congress.gov/v3/bill/${input.congress}/${input.type.toLowerCase()}/${input.number}/summaries`,
  );
  url.searchParams.set("format", "json");
  // The max page size, requested explicitly so a single call covers the rare bill with more than the default 20.
  url.searchParams.set("limit", "250");
  url.searchParams.set("api_key", apiKey);

  try {
    const response: Response = await fetch(url, {
      next: {
        revalidate: 300,
        tags: ["congress-bills", `bill-${input.congress}-${input.type}-${input.number}`],
      },
      headers: { Accept: "application/json" },
    });

    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Congress.gov responded with ${response.status}`);

    const payload = (await response.json()) as CongressApiSummariesResponse;
    const summaries: BillSummary[] = (payload.summaries ?? [])
      .map(mapCongressSummary)
      .filter((summary: BillSummary | null): summary is BillSummary => summary !== null);

    return sortSummariesByDateDesc(summaries);
  } catch (error) {
    console.error("[congress] Failed to fetch bill summaries:", error);
    return [];
  }
}

/**
 * Fetches every official text version on file for a bill (e.g. "Introduced in House", "Engrossed in House"), most
 * recent first, each with links to its Formatted Text / PDF / XML renderings on Congress.gov.
 *
 * These are links to the official record, not text this app fetches and re-hosts itself — consistent with this
 * app's "the official source stays the source of truth" stance (see docs/decisions.md). Returns an empty list in
 * preview mode (deliberately — see `previewSummaries` for why fixtures don't fabricate links to specific documents
 * that don't exist) and on any live-request failure.
 */
export async function getBillTextVersions(input: {
  congress: string;
  type: string;
  number: string;
}): Promise<BillTextVersion[]> {
  const apiKey: string | undefined = process.env.CONGRESS_API_KEY;
  if (!apiKey) return [];

  const url: URL = new URL(
    `https://api.congress.gov/v3/bill/${input.congress}/${input.type.toLowerCase()}/${input.number}/text`,
  );
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "250");
  url.searchParams.set("api_key", apiKey);

  try {
    const response: Response = await fetch(url, {
      next: {
        revalidate: 300,
        tags: ["congress-bills", `bill-${input.congress}-${input.type}-${input.number}`],
      },
      headers: { Accept: "application/json" },
    });

    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Congress.gov responded with ${response.status}`);

    const payload = (await response.json()) as CongressApiTextResponse;
    const versions: BillTextVersion[] = (payload.textVersions ?? [])
      .map(mapCongressTextVersion)
      .filter((version: BillTextVersion | null): version is BillTextVersion => version !== null);

    return sortTextVersionsByDateDesc(versions);
  } catch (error) {
    console.error("[congress] Failed to fetch bill text versions:", error);
    return [];
  }
}
