/**
 * Covers the related-measures read: the request it issues, the shape it maps, the completeness bar it holds a reference
 * to, and the publisher order it leaves alone.
 *
 * The attribution assertions matter more here than anywhere else in the adapter. Two bills being "related" is a
 * judgment some body made rather than something either bill records, so a relationship that arrived without its
 * `identifiedBy` and one that arrived with it are different claims — and the page prints the difference.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BillRouteParams, RelatedBill } from "@/lib/congress/bills/model";
import { getRelatedBills } from "@/lib/congress/client";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

const ROUTE: BillRouteParams = { congress: "119", type: "hr", number: "1" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Three measures in the publisher's order, the last of them in the other chamber. */
const PAYLOAD = {
  relatedBills: [
    {
      congress: 119,
      type: "HR",
      number: 8415,
      title: "Small Business Tax Cut Act",
      latestAction: { actionDate: "2026-04-21", text: "Referred to the House Committee on Ways and Means." },
      relationshipDetails: [{ identifiedBy: "CRS", type: "Related bill" }],
    },
    {
      congress: 119,
      type: "hr",
      number: "5463",
      title: "Choice Arrangement",
      relationshipDetails: [{ identifiedBy: "CRS", type: "Related bill" }, { type: "Procedurally-related" }],
    },
    {
      congress: 118,
      type: "S",
      number: 2875,
      title: "CHOICE Act",
      latestAction: { actionDate: "2025-09-18", text: "Read twice and referred to the Committee on Finance." },
      relationshipDetails: [{ identifiedBy: "Senate", type: "Identical bill" }],
    },
  ],
};

beforeEach((): void => {
  vi.restoreAllMocks();
  process.env.CONGRESS_API_KEY = "test-key";
});

afterEach((): void => {
  vi.unstubAllGlobals();
  if (originalApiKey === undefined) delete process.env.CONGRESS_API_KEY;
  else process.env.CONGRESS_API_KEY = originalApiKey;
});

describe("getRelatedBills", (): void => {
  it("requests the bill's own relatedbills sub-resource", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(PAYLOAD));
    vi.stubGlobal("fetch", fetchMock);

    await getRelatedBills(ROUTE);

    const url: URL = fetchMock.mock.calls[0]?.[0] as URL;

    // One word, no hyphen — the endpoint is `/relatedbills`, unlike every other multi-word path in this API.
    expect(url.pathname).toBe("/v3/bill/119/hr/1/relatedbills");
    expect(url.searchParams.get("format")).toBe("json");
  });

  it("keeps the publisher's order, which the API documents no meaning for", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const related: RelatedBill[] = await getRelatedBills(ROUTE);

    expect(related.map((measure: RelatedBill): string => measure.number)).toEqual(["8415", "5463", "2875"]);
  });

  it("upper-cases the bill type so an inward link matches every other link to that bill", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    expect((await getRelatedBills(ROUTE)).map((measure: RelatedBill): string => measure.type)).toEqual([
      "HR",
      "HR",
      "S",
    ]);
  });

  it("carries every relationship with the body that identified it", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const related: RelatedBill[] = await getRelatedBills(ROUTE);

    expect(related[0]?.relationships).toEqual([{ type: "Related bill", identifiedBy: "CRS" }]);
    // An unattributed relationship is kept rather than dropped — the claim is still on the record, and the view simply
    // prints it without a source rather than inventing one.
    expect(related[1]?.relationships).toEqual([
      { type: "Related bill", identifiedBy: "CRS" },
      { type: "Procedurally-related", identifiedBy: undefined },
    ]);
    expect(related[2]?.relationships).toEqual([{ type: "Identical bill", identifiedBy: "Senate" }]);
  });

  it("keeps a related measure sitting in a different Congress from the bill pointing at it", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    expect((await getRelatedBills(ROUTE))[2]?.congress).toBe(118);
  });

  it("carries a latest action only when it has text to show", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const related: RelatedBill[] = await getRelatedBills(ROUTE);

    expect(related[0]?.latestAction).toEqual({
      date: "2026-04-21",
      text: "Referred to the House Committee on Ways and Means.",
    });
    // A date with no sentence beside it would render as a stray timestamp, so the whole object is dropped.
    expect(related[1]?.latestAction).toBeUndefined();
  });

  it("drops a reference missing anything its inward link is built from", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          relatedBills: [
            { type: "S", number: 10, title: "No Congress Act" },
            { congress: 119, number: 11, title: "No Type Act" },
            { congress: 119, type: "S", title: "No Number Act" },
            { congress: 119, type: "S", number: 12 },
            { congress: 119, type: "S", number: 13, title: "Complete Act" },
          ],
        }),
      ),
    );

    const related: RelatedBill[] = await getRelatedBills(ROUTE);

    expect(related.map((measure: RelatedBill): string => measure.title)).toEqual(["Complete Act"]);
  });

  it("returns an empty relationship list when the record named none", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ relatedBills: [{ congress: 119, type: "S", number: 1, title: "Bare Act" }] }),
        ),
    );

    expect((await getRelatedBills(ROUTE))[0]?.relationships).toEqual([]);
  });

  it("drops a relationship that names no type, since an attribution alone says nothing", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          relatedBills: [
            {
              congress: 119,
              type: "S",
              number: 1,
              title: "Bare Act",
              relationshipDetails: [{ identifiedBy: "CRS" }, { type: "  " }, { type: "Related bill" }],
            },
          ],
        }),
      ),
    );

    expect((await getRelatedBills(ROUTE))[0]?.relationships).toEqual([
      { type: "Related bill", identifiedBy: undefined },
    ]);
  });

  it("returns nothing without ever requesting when no key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await getRelatedBills(ROUTE)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns nothing without ever requesting for a malformed route", async (): Promise<void> => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await getRelatedBills({ congress: "119", type: "notatype", number: "1" })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a 404 and an outage alike, since neither leaves a companion to show", async (): Promise<void> => {
    // Stubbed rather than merely tolerated: the two halves return the same empty list but log differently — a 404 is an
    // answer and stays quiet, an outage is not and is reported — and asserting that here is what keeps the server log
    // out of this suite's output, where it reads like a failure in a passing run.
    const logged = vi.spyOn(console, "error").mockImplementation((): void => {});

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));
    expect(await getRelatedBills(ROUTE)).toEqual([]);
    expect(logged).not.toHaveBeenCalled();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await getRelatedBills(ROUTE)).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(1);
  });
});
