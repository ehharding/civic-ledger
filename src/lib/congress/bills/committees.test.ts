/**
 * Covers the bill-to-committee read: the request it issues, the shape it maps, and the two things it deliberately
 * declines to do — reorder the publisher's list, and print an activity the publisher named `"Unknown"`.
 *
 * The ordering assertions are the load-bearing ones. Congress.gov returns a bill's committees with the committee of
 * primary jurisdiction first, which is a fact carried entirely by position; any sort applied here would destroy it
 * silently, and destroy it in a way that still looks like a working feature.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BillRouteParams } from "@/lib/congress/bills/model";
import type { BillSubResource } from "@/lib/congress/bills/sub-resource";
import { getBillCommittees } from "@/lib/congress/client";
import type { BillCommittee } from "@/lib/congress/committees/model";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

const ROUTE: BillRouteParams = { congress: "118", type: "hr", number: "3746" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Two committees in the order Congress.gov returns them, the first with a subcommittee and an `"Unknown"` activity. */
const PAYLOAD = {
  committees: [
    {
      systemCode: "HSPW00",
      name: "Transportation and Infrastructure Committee",
      chamber: "House",
      type: "Standing",
      activities: [{ name: "Unknown", date: "2023-06-01T12:00:00Z" }, { name: "Referred To" }],
      subcommittees: [
        { systemCode: "hspw12", name: "Highways and Transit Subcommittee", activities: [{ name: "Referred to" }] },
        { systemCode: "hspw05", name: "Aviation Subcommittee", activities: [] },
      ],
    },
    {
      systemCode: "hsag00",
      name: "Agriculture Committee",
      chamber: "House",
      type: "Standing",
      activities: [{ name: "Referred To" }],
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

describe("getBillCommittees", (): void => {
  it("requests the bill's own committees sub-resource", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(PAYLOAD));
    vi.stubGlobal("fetch", fetchMock);

    await getBillCommittees(ROUTE);

    const url: URL = fetchMock.mock.calls[0]?.[0] as URL;

    expect(url.pathname).toBe("/v3/bill/118/hr/3746/committees");
    expect(url.searchParams.get("format")).toBe("json");
  });

  it("keeps Congress.gov's order, which puts the committee of primary jurisdiction first", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const { entries: committees }: BillSubResource<BillCommittee> = await getBillCommittees(ROUTE);

    // Not alphabetical — "Agriculture" would sort first, and sorting it there would assert something false about which
    // committee held the bill.
    expect(committees.map((committee: BillCommittee): string => committee.systemCode)).toEqual(["hspw00", "hsag00"]);
  });

  it("lower-cases the system code, so an inward link matches every other link to that committee", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const {
      entries: [first],
    }: BillSubResource<BillCommittee> = await getBillCommittees(ROUTE);

    expect(first?.systemCode).toBe("hspw00");
    expect(first?.chamber).toBe("house");
    expect(first?.type).toBe("standing");
  });

  it("drops the activity Congress.gov names 'Unknown' rather than printing a non-answer", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const {
      entries: [first],
    }: BillSubResource<BillCommittee> = await getBillCommittees(ROUTE);

    expect(first?.activities).toEqual([{ name: "Referred To", date: undefined }]);
  });

  it("sorts subcommittees alphabetically, where the publisher's order carries nothing", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const {
      entries: [first],
    }: BillSubResource<BillCommittee> = await getBillCommittees(ROUTE);

    expect(first?.subcommittees.map((sub): string => sub.name)).toEqual([
      "Aviation Subcommittee",
      "Highways and Transit Subcommittee",
    ]);
  });

  it("drops a committee with no recognizable chamber, since its link could not be built", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          committees: [
            { systemCode: "jsec00", name: "No Chamber Committee", chamber: "NoChamber" },
            { systemCode: "hsag00", name: "Agriculture Committee", chamber: "House" },
          ],
        }),
      ),
    );

    const { entries: committees }: BillSubResource<BillCommittee> = await getBillCommittees(ROUTE);

    expect(committees.map((committee: BillCommittee): string => committee.systemCode)).toEqual(["hsag00"]);
  });

  it("returns nothing without ever requesting when no key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await getBillCommittees(ROUTE)).toEqual({ entries: [], unavailable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns nothing without ever requesting for a malformed route", async (): Promise<void> => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await getBillCommittees({ congress: "119", type: "notatype", number: "1" })).toEqual({
      entries: [],
      unavailable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("separates a 404 from an outage, since only one of them says the bill was never referred", async (): Promise<void> => {
    // Stubbed rather than merely tolerated: the two halves both return no referrals but differ in every other way — a
    // 404 is an answer, stays quiet, and licenses the page's "no committee referral appears on this bill's record"; an
    // outage is not an answer, is logged, and licenses nothing. Asserting that here also keeps the server log out of
    // this suite's output, where it reads like a failure in a passing run.
    const logged = vi.spyOn(console, "error").mockImplementation((): void => {});

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));
    expect(await getBillCommittees(ROUTE)).toEqual({ entries: [], unavailable: false });
    expect(logged).not.toHaveBeenCalled();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await getBillCommittees(ROUTE)).toEqual({ entries: [], unavailable: true });
    expect(logged).toHaveBeenCalledTimes(1);
  });
});
