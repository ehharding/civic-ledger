/**
 * Covers the adapter's middle fallback: the ingested copy.
 *
 * Every read in this app now degrades in a fixed order — live, then stored, then labeled preview data — and this file
 * exists because that order is a *product* claim, not an implementation detail. Two ways of breaking it would both pass
 * every other test in the suite: serving a stored record while labeling it `live`, which overstates its currency, and
 * skipping the stored copy for fiction, which throws away real records in favor of made-up ones.
 *
 * The stored reads themselves are stubbed here. `stored.test.ts` covers what they do; what matters at this seam is
 * which of them each caller consults, in what order, and what provenance survives the trip.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type BillLookupResult,
  type CommitteeDirectoryResult,
  getBillById,
  getCommitteeDirectory,
  getCongressComposition,
  getCongressSnapshot,
  getMemberDirectory,
  type MemberDirectoryResult,
} from "@/lib/congress/client";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import type { CongressComposition } from "@/lib/congress/members";
import type { CongressSnapshot, LegislativeBill } from "@/lib/congress/types";
import * as stored from "@/lib/ingest/stored";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;
const CONFIRMED_AT: string = "2026-07-31T09:00:00.000Z";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function bill(overrides: Partial<LegislativeBill> = {}): LegislativeBill {
  return {
    congress: getCurrentCongress(),
    type: "HR",
    number: "284",
    title: "A bill to widen rural broadband access",
    originChamber: "House",
    introducedDate: "2026-01-14",
    latestAction: { date: "2026-03-02", text: "Referred to committee." },
    stage: "committee",
    officialUrl: "https://www.congress.gov/bill/119th-congress/house-bill/284",
    ...overrides,
  };
}

function storedSnapshot(): CongressSnapshot {
  return {
    bills: [bill()],
    source: "stored",
    retrievedAt: CONFIRMED_AT,
    notice: "Congress.gov could not be reached, so records this app stored earlier are shown.",
  };
}

function storedComposition(): CongressComposition {
  return {
    congress: getCurrentCongress(),
    chambers: [
      {
        chamber: "house",
        members: [{ bioguideId: "B000001", name: "Bennett, Marcus T.", party: "republican", state: "Ohio" }],
        partyCounts: [{ party: "republican", count: 1 }],
        votingSeats: 1,
        nonVotingSeats: 0,
      },
      {
        chamber: "senate",
        members: [{ bioguideId: "L000174", name: "Leahy, Patrick J.", party: "democratic", state: "Vermont" }],
        partyCounts: [{ party: "democratic", count: 1 }],
        votingSeats: 1,
        nonVotingSeats: 0,
      },
    ],
    source: "stored",
    retrievedAt: CONFIRMED_AT,
  };
}

/** Nothing on file — the state of every deployment without a database, and the one every other test runs in. */
function nothingStored(): void {
  vi.spyOn(stored, "getStoredBillSnapshot").mockResolvedValue(null);
  vi.spyOn(stored, "getStoredBill").mockResolvedValue(null);
  vi.spyOn(stored, "getStoredComposition").mockResolvedValue(null);
  vi.spyOn(stored, "getStoredCommitteeDirectory").mockResolvedValue(null);
}

/** Every upstream request fails, which is what pushes each read onto its fallback. */
function upstreamDown(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (): Promise<Response> => jsonResponse({ error: "service unavailable" }, 503)),
  );
}

beforeEach((): void => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation((): void => undefined);
  process.env.CONGRESS_API_KEY = "test-key";
  nothingStored();
});

afterEach((): void => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalApiKey === undefined) delete process.env.CONGRESS_API_KEY;
  else process.env.CONGRESS_API_KEY = originalApiKey;
});

describe("the bill snapshot", (): void => {
  it("serves the stored copy when upstream is unreachable", async (): Promise<void> => {
    upstreamDown();
    vi.spyOn(stored, "getStoredBillSnapshot").mockResolvedValue(storedSnapshot());

    const snapshot: CongressSnapshot = await getCongressSnapshot();

    expect(snapshot.source).toBe("stored");
    expect(snapshot.bills[0]?.number).toBe("284");
  });

  it("serves the stored copy when no API key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;
    vi.spyOn(stored, "getStoredBillSnapshot").mockResolvedValue(storedSnapshot());

    expect((await getCongressSnapshot()).source).toBe("stored");
  });

  /* The freshness a stored page prints is when the copy was last confirmed, not when the page was rendered. */
  it("keeps the copy's own confirmation time rather than stamping the request", async (): Promise<void> => {
    upstreamDown();
    vi.spyOn(stored, "getStoredBillSnapshot").mockResolvedValue(storedSnapshot());

    expect((await getCongressSnapshot()).retrievedAt).toBe(CONFIRMED_AT);
  });

  /* Unchanged behavior where there is nothing on file, which is every deployment without a database. */
  it("falls through to labeled preview data when nothing is stored", async (): Promise<void> => {
    upstreamDown();

    expect((await getCongressSnapshot()).source).toBe("preview");
  });

  it("prefers live data over the stored copy when upstream answers", async (): Promise<void> => {
    const storedRead = vi.spyOn(stored, "getStoredBillSnapshot").mockResolvedValue(storedSnapshot());
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (): Promise<Response> =>
          jsonResponse({
            bills: [
              {
                congress: getCurrentCongress(),
                type: "HR",
                number: "900",
                title: "A live bill",
                originChamber: "House",
                latestAction: { actionDate: "2026-07-30", text: "Introduced." },
              },
            ],
          }),
      ),
    );

    const snapshot: CongressSnapshot = await getCongressSnapshot();

    expect(snapshot.source).toBe("live");
    expect(storedRead).not.toHaveBeenCalled();
  });
});

describe("a single bill lookup", (): void => {
  const route = { congress: String(getCurrentCongress()), type: "hr", number: "284" };

  it("serves the stored record when upstream is unreachable", async (): Promise<void> => {
    upstreamDown();
    vi.spyOn(stored, "getStoredBill").mockResolvedValue({ bill: bill(), retrievedAt: CONFIRMED_AT });

    const lookup: BillLookupResult = await getBillById(route);

    expect(lookup.source).toBe("stored");
    expect(lookup.bill?.number).toBe("284");
    expect(lookup.retrievedAt).toBe(CONFIRMED_AT);
    expect(lookup.notice).toContain("stored earlier");
  });

  it("serves the stored record when no API key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;
    vi.spyOn(stored, "getStoredBill").mockResolvedValue({ bill: bill(), retrievedAt: CONFIRMED_AT });

    expect((await getBillById(route)).source).toBe("stored");
  });

  /* A 404 is a *true answer* — this bill does not exist — so consulting the copy would turn a correct "no such record"
     into a stale record from before it was withdrawn. Only an outage reaches the stored path. */
  it("does not consult the copy when upstream says the record does not exist", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (): Promise<Response> => jsonResponse({}, 404)),
    );
    const storedRead = vi.spyOn(stored, "getStoredBill").mockResolvedValue({ bill: bill(), retrievedAt: CONFIRMED_AT });

    const lookup: BillLookupResult = await getBillById(route);

    expect(lookup.bill).toBeUndefined();
    expect(lookup.source).toBe("live");
    expect(storedRead).not.toHaveBeenCalled();
  });

  it("falls through to the snapshot search and preview data when nothing is stored", async (): Promise<void> => {
    upstreamDown();

    const lookup: BillLookupResult = await getBillById(route);

    expect(lookup.source).toBe("preview");
  });
});

describe("the chamber composition", (): void => {
  it("serves the stored roster when upstream is unreachable", async (): Promise<void> => {
    upstreamDown();
    vi.spyOn(stored, "getStoredComposition").mockResolvedValue(storedComposition());

    const built: CongressComposition = await getCongressComposition();

    expect(built.source).toBe("stored");
    expect(built.chambers).toHaveLength(2);
  });

  it("serves the stored roster when no API key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;
    vi.spyOn(stored, "getStoredComposition").mockResolvedValue(storedComposition());

    expect((await getCongressComposition()).source).toBe("stored");
  });

  it("falls through to labeled placeholder seats when nothing is stored", async (): Promise<void> => {
    upstreamDown();

    expect((await getCongressComposition()).source).toBe("preview");
  });
});

describe("the member directory", (): void => {
  /* Inherited rather than implemented: the directory reads the composition, so where the roster came from is where the
     directory came from. The two views cannot disagree about who is serving, and now cannot disagree about provenance
     either. */
  it("reports the provenance of the roster it was built from", async (): Promise<void> => {
    upstreamDown();
    vi.spyOn(stored, "getStoredComposition").mockResolvedValue(storedComposition());

    const directory: MemberDirectoryResult = await getMemberDirectory();

    expect(directory.source).toBe("stored");
    expect(directory.members.map((entry): string => entry.bioguideId)).toEqual(["B000001", "L000174"]);
  });

  it("still reports the placeholder people as preview when nothing is stored", async (): Promise<void> => {
    upstreamDown();

    expect((await getMemberDirectory()).source).toBe("preview");
  });
});

describe("the committee directory", (): void => {
  function storedDirectory(): CommitteeDirectoryResult {
    return {
      congress: getCurrentCongress(),
      committees: [
        {
          systemCode: "hsag00",
          name: "Agriculture Committee",
          chamber: "house",
          type: "standing",
          subcommitteeCount: 6,
        },
      ],
      source: "stored",
      retrievedAt: CONFIRMED_AT,
    };
  }

  it("serves the stored list when upstream is unreachable", async (): Promise<void> => {
    upstreamDown();
    vi.spyOn(stored, "getStoredCommitteeDirectory").mockResolvedValue(storedDirectory());

    const directory: CommitteeDirectoryResult = await getCommitteeDirectory();

    expect(directory.source).toBe("stored");
    expect(directory.committees[0]?.systemCode).toBe("hsag00");
  });

  it("serves the stored list when no API key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;
    vi.spyOn(stored, "getStoredCommitteeDirectory").mockResolvedValue(storedDirectory());

    expect((await getCommitteeDirectory()).source).toBe("stored");
  });

  it("falls through to labeled placeholder committees when nothing is stored", async (): Promise<void> => {
    upstreamDown();

    expect((await getCommitteeDirectory()).source).toBe("preview");
  });
});
