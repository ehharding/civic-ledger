/**
 * Covers the bill-to-cosponsor read: the request it issues, the shape it maps, and the two things it deliberately
 * declines to do — reorder the publisher's list, and drop a cosponsor merely for arriving without a Bioguide ID.
 *
 * The ordering assertion is the load-bearing one, for the same reason it is in `bill-committees.test.ts`. Congress.gov
 * returns cosponsors oldest first — the members who signed at introduction, then everyone who joined afterwards — and
 * that sequence is the bill gathering support over time. Any sort applied here would destroy it silently, and destroy
 * it in a way that still looks like a working feature.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BillCosponsor, BillRouteParams } from "@/lib/congress/bills/model";
import { getBillCosponsors } from "@/lib/congress/client";
import { previewCosponsors } from "@/lib/congress/upstream/fixtures";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

const ROUTE: BillRouteParams = { congress: "118", type: "hr", number: "815" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Four cosponsors in the order Congress.gov returns them: two original signers, then two who joined later. */
const PAYLOAD = {
  cosponsors: [
    {
      bioguideId: "B001301",
      fullName: "Rep. Bergman, Jack [R-MI-1]",
      party: "R",
      state: "MI",
      district: 1,
      sponsorshipDate: "2023-02-02",
      isOriginalCosponsor: true,
    },
    {
      bioguideId: "P000618",
      fullName: "Rep. Pappas, Chris [D-NH-1]",
      party: "D",
      state: "NH",
      district: 1,
      sponsorshipDate: "2023-02-02",
      isOriginalCosponsor: true,
    },
    {
      bioguideId: "M001200",
      fullName: "Rep. Miller-Meeks, Mariannette [R-IA-1]",
      party: "R",
      state: "IA",
      sponsorshipDate: "2023-03-07",
      isOriginalCosponsor: false,
    },
    {
      bioguideId: "L000564",
      fullName: "Rep. Lamborn, Doug [R-CO-5]",
      party: "R",
      state: "CO",
      sponsorshipDate: "2023-03-07",
      sponsorshipWithdrawnDate: "2023-05-01",
      isOriginalCosponsor: false,
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

describe("getBillCosponsors", (): void => {
  it("requests the bill's own cosponsors sub-resource", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(PAYLOAD));
    vi.stubGlobal("fetch", fetchMock);

    await getBillCosponsors(ROUTE);

    const url: URL = fetchMock.mock.calls[0]?.[0] as URL;

    expect(url.pathname).toBe("/v3/bill/118/hr/815/cosponsors");
    expect(url.searchParams.get("format")).toBe("json");
  });

  it("keeps Congress.gov's chronological order rather than sorting by date or name", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const cosponsors: BillCosponsor[] = await getBillCosponsors(ROUTE);

    // Neither alphabetical ("Bergman, Lamborn, Miller-Meeks, Pappas") nor newest-first, both of which would throw away
    // the sequence in which the bill actually gathered its support.
    expect(cosponsors.map((cosponsor: BillCosponsor): string => cosponsor.bioguideId ?? "")).toEqual([
      "B001301",
      "P000618",
      "M001200",
      "L000564",
    ]);
  });

  it("reads the original-cosponsor flag from the record rather than comparing dates", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const cosponsors: BillCosponsor[] = await getBillCosponsors(ROUTE);

    expect(cosponsors.map((cosponsor: BillCosponsor): boolean => cosponsor.isOriginal)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("carries the withdrawal date on the rare row that has one", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const cosponsors: BillCosponsor[] = await getBillCosponsors(ROUTE);

    expect(cosponsors[3]?.withdrawnDate).toBe("2023-05-01");
    expect(cosponsors[0]?.withdrawnDate).toBeUndefined();
  });

  it("keeps a cosponsor with no Bioguide ID, since the name still says who signed on", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          cosponsors: [{ fullName: "Rep. Unlinkable, Sample [I-ZZ-1]", party: "I" }, { party: "D" }],
        }),
      ),
    );

    const cosponsors: BillCosponsor[] = await getBillCosponsors(ROUTE);

    // The first survives without an id — only its link is lost. The second has no name at all and is not a row.
    expect(cosponsors).toHaveLength(1);
    expect(cosponsors[0]?.fullName).toBe("Rep. Unlinkable, Sample [I-ZZ-1]");
    expect(cosponsors[0]?.bioguideId).toBeUndefined();
  });

  it("defaults the original flag to false when the record omits it", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ cosponsors: [{ fullName: "Rep. Nobody, Sample [D-ZZ-1]" }] })),
    );

    expect((await getBillCosponsors(ROUTE))[0]?.isOriginal).toBe(false);
  });

  it("serves the labeled fixture without requesting when no key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // The static demo is the only build a UI reviewer can see, so the no-key path shows this section working rather
    // than showing its empty state. @see previewCosponsors.
    expect(await getBillCosponsors({ congress: "119", type: "hr", number: "284" })).toEqual(
      previewCosponsors["119-HR-284"],
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns nothing for a fixture that has no preview cosponsors, without requesting", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await getBillCosponsors(ROUTE)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("draws every preview cosponsor from a member the fixtures already name", async (): Promise<void> => {
    // The rule that keeps this from widening the fiction: no preview cosponsor may be a person who does not already
    // have a placeholder page. @see docs/data-policy.md.
    const ids: string[] = Object.values(previewCosponsors)
      .flat()
      .map((cosponsor: BillCosponsor): string => cosponsor.bioguideId ?? "");

    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toMatch(/^PREVIEW-[1-7]$/);
  });

  it("returns nothing without ever requesting for a malformed route", async (): Promise<void> => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await getBillCosponsors({ congress: "119", type: "notatype", number: "1" })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a 404 and an outage alike, since neither leaves a name to show", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));
    expect(await getBillCosponsors(ROUTE)).toEqual([]);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await getBillCosponsors(ROUTE)).toEqual([]);
  });
});
