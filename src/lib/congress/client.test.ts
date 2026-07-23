/**
 * Covers client.ts's three main paths: the no-key preview fallback, mapping live API responses
 * (list- and detail-endpoint field-name variants both need coverage — see mapCongressBill), and the
 * distinction between "not found" (404) and "temporarily unavailable" (any other failure).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type BillLookupResult, getBillById, getCongressSnapshot, getMoreBills } from "@/lib/congress/client";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { firstPreviewBill, previewBills } from "@/lib/congress/fixtures";
import type { CongressSnapshot, LegislativeBill } from "@/lib/congress/types";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach((): void => {
  vi.restoreAllMocks();
});

afterEach((): void => {
  if (originalApiKey === undefined) {
    delete process.env.CONGRESS_API_KEY;
  } else {
    process.env.CONGRESS_API_KEY = originalApiKey;
  }
});

describe("getCongressSnapshot", (): void => {
  it("returns labeled preview data when no API key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const snapshot: CongressSnapshot = await getCongressSnapshot();

    expect(snapshot.source).toBe("preview");
    expect(snapshot.bills).toEqual(previewBills);
    expect(snapshot.notice).toMatch(/preview/i);
  });

  it("maps live list-endpoint bills using type/number field names", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          bills: [
            {
              congress: 119,
              type: "hr",
              number: 42,
              title: "A Live Bill",
              originChamber: "House",
              latestAction: { actionDate: "2026-07-01", text: "Referred to Committee." },
              policyArea: { name: "Health" },
              url: "https://api.congress.gov/v3/bill/119/hr/42",
            },
          ],
        }),
      ),
    );

    const snapshot: CongressSnapshot = await getCongressSnapshot();

    expect(snapshot.source).toBe("live");
    expect(snapshot.bills).toHaveLength(1);
    expect(snapshot.bills[0]).toMatchObject({
      congress: 119,
      type: "HR",
      number: "42",
      title: "A Live Bill",
      stage: "committee",
    });
  });

  it("requests the bill list scoped to the current Congress, not the unfiltered list", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ bills: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await getCongressSnapshot();

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe(`/v3/bill/${getCurrentCongress()}`);
  });

  it("falls back to preview data when the upstream request fails", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    vi.spyOn(console, "error").mockImplementation((): void => {});

    const snapshot: CongressSnapshot = await getCongressSnapshot();

    expect(snapshot.source).toBe("preview");
    expect(snapshot.notice).toMatch(/temporarily unavailable/i);
  });
});

describe("getBillById", (): void => {
  it("finds a matching preview bill when no API key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const target: LegislativeBill = firstPreviewBill;
    const result: BillLookupResult = await getBillById({
      congress: String(target.congress),
      type: target.type,
      number: target.number,
    });

    expect(result.bill).toEqual(target);
    expect(result.source).toBe("preview");
  });

  it("maps a live detail-endpoint bill using billType/billNumber field names", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          bill: {
            congress: 117,
            billType: "HR",
            billNumber: "3076",
            title: "Postal Service Reform Act of 2021",
            originChamber: "House",
            latestAction: { date: "2022-04-06", text: "Became Public Law No: 117-108." },
            policyArea: { name: "Government Operations and Politics" },
          },
        }),
      ),
    );

    const result: BillLookupResult = await getBillById({ congress: "117", type: "hr", number: "3076" });

    expect(result.source).toBe("live");
    expect(result.bill).toMatchObject({
      congress: 117,
      type: "HR",
      number: "3076",
      stage: "law",
    });
  });

  it("returns undefined for a real 404 instead of silently falling back", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));

    const result: BillLookupResult = await getBillById({ congress: "119", type: "hr", number: "999999" });

    expect(result.bill).toBeUndefined();
    expect(result.source).toBe("live");
  });

  it("falls back to a snapshot search and reports that source when the direct lookup throws", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    vi.spyOn(console, "error").mockImplementation((): void => {});

    const target: LegislativeBill = firstPreviewBill;
    const result: BillLookupResult = await getBillById({
      congress: String(target.congress),
      type: target.type,
      number: target.number,
    });

    // The direct lookup's fetch rejects, and so does the snapshot search's own fetch, so both fall back to preview.
    expect(result.bill).toEqual(target);
    expect(result.source).toBe("preview");
    expect(result.notice).toMatch(/temporarily unavailable/i);
  });
});

describe("getMoreBills", (): void => {
  it("returns an empty page when no API key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const bills: LegislativeBill[] = await getMoreBills(12);

    expect(bills).toEqual([]);
  });

  it("requests the given offset and maps the returned page", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        bills: [
          {
            congress: 119,
            type: "S",
            number: "10",
            title: "Another Bill",
            latestAction: { actionDate: "2026-07-02", text: "Introduced in Senate." },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const bills: LegislativeBill[] = await getMoreBills(24);

    expect(bills).toHaveLength(1);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe(`/v3/bill/${getCurrentCongress()}`);
    expect(requestedUrl.searchParams.get("offset")).toBe("24");
  });
});
