import { previewBills } from "@/lib/congress/fixtures";
import { inferBillStage } from "@/lib/congress/stage";
import { type CongressSnapshot, DEFAULT_PAGE_SIZE, type LegislativeBill } from "@/lib/congress/types";

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
};

/** Shape of GET /v3/bill (the list endpoint). */
type CongressApiListResponse = {
  bills?: CongressApiBill[];
};

/** Shape of GET /v3/bill/{congress}/{type}/{number} (the single-bill detail endpoint). */
type CongressApiDetailResponse = {
  bill?: CongressApiBill;
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

  const actionText: string = bill.latestAction?.text ?? "No Action Text Has Been Published Yet.";

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
  };
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
 * Fetches one page of the bill list. Returns `null` on any failure so callers can decide how to fall back (preview data
 * for the homepage, an empty page for "load more").
 */
async function fetchBillsPage(input: {
  apiKey: string;
  offset: number;
  limit: number;
}): Promise<LegislativeBill[] | null> {
  const url: URL = new URL("https://api.congress.gov/v3/bill");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(input.limit));
  url.searchParams.set("offset", String(input.offset));
  url.searchParams.set("api_key", input.apiKey);

  try {
    const response: Response = await fetch(url, {
      next: { revalidate: 300, tags: ["congress-bills"] },
      headers: { Accept: "application/json" },
    });

    if (!response.ok) throw new Error(`Congress.gov Responded With ${response.status}`);

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
 * Fetches the first page of current bills for the homepage and bill directory.
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
      notice: "Preview Records Are Shown Until a Server-Only Congress.gov API Key Is Configured.",
    };
  }

  const bills: LegislativeBill[] | null = await fetchBillsPage({
    apiKey,
    offset: 0,
    limit: DEFAULT_PAGE_SIZE,
  });

  if (!bills || bills.length === 0) {
    return {
      bills: previewBills,
      source: "preview",
      retrievedAt,
      notice: "Live Records Are Temporarily Unavailable, So Preview Records Are Shown.",
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
    if (!response.ok) throw new Error(`Congress.gov Responded With ${response.status}`);

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
