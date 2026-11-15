/**
 * Covers the amendments read: request, mapping, and publisher order. The mapper requires identity only — most entries
 * carry no purpose — so the fixture is shaped like the real, mostly bare payload.
 */
import { describe, expect, it, vi } from "vitest";

import type { BillAmendment, BillRouteParams } from "@/lib/congress/bills/model";
import type { BillSubResource } from "@/lib/congress/bills/sub-resource";
import { getBillAmendments } from "@/lib/congress/client";
import { jsonResponse, requestedUrl, stubLiveApi, stubPreviewApi } from "@/test/congress-api";

const ROUTE: BillRouteParams = { congress: "119", type: "hr", number: "1" };

/**
 * Four amendments in the publisher's order, shaped like the live payload: one fully described, one carrying only the
 * House's `description`, one bare but for its identity, and one from the other chamber.
 */
const PAYLOAD = {
  amendments: [
    {
      congress: 119,
      type: "SAMDT",
      number: 2849,
      purpose: "To strike a provision relating to delayed implementation.",
      updateDate: "2025-07-03T14:37:57Z",
      latestAction: {
        actionDate: "2025-07-01",
        text: "Amendment SA 2849 not agreed to in Senate by Yea-Nay Vote. 45 - 55.",
      },
    },
    {
      congress: 119,
      type: "hamdt",
      number: "74",
      description: "An amendment numbered 132 printed in House Report 117-75 to require a resiliency assessment.",
    },
    { congress: 119, type: "SAMDT", number: 2850, updateDate: "2025-07-02T11:08:27Z" },
    { congress: 118, type: "SAMDT", number: 1 },
  ],
};

describe("getBillAmendments", (): void => {
  it("requests the bill's own amendments sub-resource, at the page ceiling", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(PAYLOAD));
    stubLiveApi(fetchMock);

    await getBillAmendments(ROUTE);

    const url: URL = requestedUrl(fetchMock);

    expect(url.pathname).toBe("/v3/bill/119/hr/1/amendments");
    expect(url.searchParams.get("format")).toBe("json");
    // The one collection where the ceiling is routinely reached rather than theoretical — a reconciliation bill draws
    // several hundred amendments, so asking for fewer would shorten the record for no reason.
    expect(url.searchParams.get("limit")).toBe("250");
  });

  it("keeps the publisher's order rather than sorting by the row's last-touched date", async (): Promise<void> => {
    stubLiveApi(vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const { entries }: BillSubResource<BillAmendment> = await getBillAmendments(ROUTE);

    // `updateDate` records when Congress.gov last touched the row, not when anything happened to the amendment.
    // Sorting by it would present a maintenance timestamp to the reader as chronology.
    expect(entries.map((amendment: BillAmendment): string => amendment.number)).toEqual(["2849", "74", "2850", "1"]);
  });

  it("keeps an entry carrying nothing but its identity, since that is still an openable reference", async (): Promise<void> => {
    stubLiveApi(vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const { entries }: BillSubResource<BillAmendment> = await getBillAmendments(ROUTE);

    expect(entries).toHaveLength(4);
    expect(entries[2]).toEqual({
      congress: 119,
      type: "SAMDT",
      number: "2850",
      purpose: undefined,
      latestAction: undefined,
      officialUrl: "https://www.congress.gov/amendment/119th-congress/senate-amendment/2850",
    });
  });

  it("prefers the amendment's own purpose and falls back to the House's description", async (): Promise<void> => {
    stubLiveApi(vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const { entries }: BillSubResource<BillAmendment> = await getBillAmendments(ROUTE);

    expect(entries[0]?.purpose).toBe("To strike a provision relating to delayed implementation.");
    expect(entries[1]?.purpose).toBe(
      "An amendment numbered 132 printed in House Report 117-75 to require a resiliency assessment.",
    );
  });

  it("treats a blank purpose as no purpose rather than as an empty line on the page", async (): Promise<void> => {
    stubLiveApi(
      vi.fn().mockResolvedValue(
        jsonResponse({
          amendments: [
            { congress: 119, type: "SAMDT", number: 1, purpose: "   " },
            { congress: 119, type: "SAMDT", number: 2, purpose: "  ", description: "The House's note." },
          ],
        }),
      ),
    );

    const { entries }: BillSubResource<BillAmendment> = await getBillAmendments(ROUTE);

    expect(entries[0]?.purpose).toBeUndefined();
    // A whitespace-only `purpose` must not shadow a `description` that actually says something.
    expect(entries[1]?.purpose).toBe("The House's note.");
  });

  it("upper-cases the type so the citation and the derived URL agree on it", async (): Promise<void> => {
    stubLiveApi(vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const { entries }: BillSubResource<BillAmendment> = await getBillAmendments(ROUTE);

    expect(entries[1]?.type).toBe("HAMDT");
    expect(entries[1]?.officialUrl).toBe("https://www.congress.gov/amendment/119th-congress/house-amendment/74");
  });

  it("keeps an amendment sitting in a different Congress from the bill pointing at it", async (): Promise<void> => {
    stubLiveApi(vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const { entries }: BillSubResource<BillAmendment> = await getBillAmendments(ROUTE);

    expect(entries[3]?.congress).toBe(118);
    expect(entries[3]?.officialUrl).toBe("https://www.congress.gov/amendment/118th-congress/senate-amendment/1");
  });

  it("carries a latest action only when it has text to show", async (): Promise<void> => {
    stubLiveApi(
      vi.fn().mockResolvedValue(
        jsonResponse({
          amendments: [
            ...PAYLOAD.amendments,
            { congress: 119, type: "SAMDT", number: 3, latestAction: { actionDate: "2025-07-01" } },
          ],
        }),
      ),
    );

    const { entries }: BillSubResource<BillAmendment> = await getBillAmendments(ROUTE);

    expect(entries[0]?.latestAction).toEqual({
      date: "2025-07-01",
      text: "Amendment SA 2849 not agreed to in Senate by Yea-Nay Vote. 45 - 55.",
    });
    // A date with no sentence beside it would render as a stray timestamp, so the whole object is dropped.
    expect(entries[4]?.latestAction).toBeUndefined();
  });

  it("drops a reference missing anything its citation and link are built from", async (): Promise<void> => {
    stubLiveApi(
      vi.fn().mockResolvedValue(
        jsonResponse({
          amendments: [
            { type: "SAMDT", number: 10, purpose: "No congress." },
            { congress: 119, number: 11, purpose: "No type." },
            { congress: 119, type: "SAMDT", purpose: "No number." },
            { congress: 119, type: "SAMDT", number: 12, purpose: "Complete." },
          ],
        }),
      ),
    );

    const { entries }: BillSubResource<BillAmendment> = await getBillAmendments(ROUTE);

    expect(entries.map((amendment: BillAmendment): string | undefined => amendment.purpose)).toEqual(["Complete."]);
  });

  it("returns nothing without ever requesting when no key is configured", async (): Promise<void> => {
    const fetchMock = stubPreviewApi();

    expect(await getBillAmendments(ROUTE)).toEqual({ entries: [], unavailable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns nothing without ever requesting for a malformed route", async (): Promise<void> => {
    const fetchMock = stubLiveApi();

    expect(await getBillAmendments({ congress: "119", type: "notatype", number: "1" })).toEqual({
      entries: [],
      unavailable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("separates a 404 from an outage, since only one of them says the bill was never amended", async (): Promise<void> => {
    // The same distinction `related.test.ts` pins, and it matters here for the same reason: "No amendment was offered
    // to this bill" is a claim about the congressional record, and a request that never resolved has not earned it.
    const logged = vi.spyOn(console, "warn").mockImplementation((): void => {});

    stubLiveApi(vi.fn().mockResolvedValue(jsonResponse({}, 404)));
    expect(await getBillAmendments(ROUTE)).toEqual({ entries: [], unavailable: false });
    expect(logged).not.toHaveBeenCalled();

    stubLiveApi(vi.fn().mockRejectedValue(new Error("network down")));
    expect(await getBillAmendments(ROUTE)).toEqual({ entries: [], unavailable: true });
    expect(logged).toHaveBeenCalledTimes(1);
  });
});
