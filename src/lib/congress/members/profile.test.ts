/**
 * Covers getMemberProfile's paths: the no-key preview fallback, mapping a live item-endpoint record (whose `terms`
 * shape differs from the list endpoint's), the guard that keeps a malformed Bioguide ID from ever reaching
 * Congress.gov, and the distinction between "no such member" (404) and "temporarily unavailable" (anything else).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LegislativeBill } from "@/lib/congress/bills/model";
import { getMemberProfile, type MemberProfileResult } from "@/lib/congress/client";
import type { MemberProfile } from "@/lib/congress/members/model";
import { previewMemberProfiles } from "@/lib/congress/upstream/fixtures";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * A fetch mock that answers every call with a *fresh* `Response`.
 *
 * `mockResolvedValue(jsonResponse(...))` hands the same object to every caller, and `getMemberProfile` issues its three
 * reads concurrently — so the first to read the body consumes it and the other two fail with "Body is unusable". The
 * profile assertions still pass, which is exactly what makes the mistake easy to keep: the legislation lists come back
 * silently empty and the failure only ever surfaces as console noise.
 */
function alwaysRespond(body: unknown, status = 200): () => Promise<Response> {
  return (): Promise<Response> => Promise.resolve(jsonResponse(body, status));
}

/** A minimal live item-endpoint payload, with the bare `terms` array that endpoint actually returns. */
function liveMemberPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    member: {
      bioguideId: "L000174",
      invertedOrderName: "Leahy, Patrick J.",
      directOrderName: "Patrick J. Leahy",
      partyName: "Democrat",
      state: "Vermont",
      currentMember: true,
      officialWebsiteUrl: "https://www.leahy.senate.gov",
      depiction: { imageUrl: "https://www.congress.gov/img/member/l000174.jpg", attribution: "<a>Senate</a>" },
      sponsoredLegislation: { count: 1753 },
      cosponsoredLegislation: { count: 7515 },
      terms: [
        { chamber: "Senate", congress: 116, startYear: 2019, endYear: 2021, memberType: "Senator" },
        { chamber: "Senate", congress: 117, startYear: 2021, memberType: "Senator" },
      ],
      ...overrides,
    },
  };
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

describe("getMemberProfile without an API key", (): void => {
  it("resolves a placeholder member and labels it as one", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;
    const expected: MemberProfile = previewMemberProfiles[0] as MemberProfile;

    const result: MemberProfileResult = await getMemberProfile(expected.bioguideId);

    expect(result.source).toBe("preview");
    expect(result.profile?.name).toBe(expected.name);
    expect(result.notice).toMatch(/placeholder/i);
  });

  it("matches a placeholder ID case-insensitively, so a hand-typed URL still resolves", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    expect((await getMemberProfile("preview-1")).profile?.bioguideId).toBe("PREVIEW-1");
  });

  it("pairs a placeholder member with the preview bills they sponsored", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const result: MemberProfileResult = await getMemberProfile("PREVIEW-1");

    expect(result.sponsored.length).toBeGreaterThan(0);
    expect(result.sponsored.every((bill): boolean => bill.sponsor?.bioguideId === "PREVIEW-1")).toBe(true);
    // The fixtures record nothing about cosponsors, so none are invented.
    expect(result.cosponsored).toEqual([]);
  });

  it("resolves an unknown ID to nobody, which the route renders as a 404", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    expect((await getMemberProfile("Z999999")).profile).toBeUndefined();
  });
});

describe("getMemberProfile with an API key", (): void => {
  it("maps a live item-endpoint record, including its bare terms array", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(alwaysRespond(liveMemberPayload())));

    const result: MemberProfileResult = await getMemberProfile("L000174");

    expect(result.source).toBe("live");
    expect(result.profile?.directOrderName).toBe("Patrick J. Leahy");
    expect(result.profile?.party).toBe("democratic");
    expect(result.profile?.chamber).toBe("senate");
    expect(result.profile?.currentMember).toBe(true);
    expect(result.profile?.sponsoredCount).toBe(1753);
    // Newest first, so terms[0] is the seat they hold now.
    expect(result.profile?.terms[0]?.congress).toBe(117);
    expect(result.profile?.terms).toHaveLength(2);
  });

  it("also accepts the nested terms.item shape, in case the endpoints ever align", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        alwaysRespond(
          liveMemberPayload({
            terms: { item: [{ chamber: "House of Representatives", congress: 118, startYear: 2023 }] },
          }),
        ),
      ),
    );

    const result: MemberProfileResult = await getMemberProfile("L000174");

    expect(result.profile?.chamber).toBe("house");
    expect(result.profile?.terms).toHaveLength(1);
  });

  it("never sends a malformed Bioguide ID upstream", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result: MemberProfileResult = await getMemberProfile("../../bill/119/hr/284");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.profile).toBeUndefined();
    expect(result.source).toBe("preview");
  });

  it("treats a 404 as 'no such member' rather than falling back to a placeholder", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));

    const result: MemberProfileResult = await getMemberProfile("Z999999");

    expect(result.profile).toBeUndefined();
    expect(result.source).toBe("live");
  });

  it("falls back to labeled placeholders when the request fails outright", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result: MemberProfileResult = await getMemberProfile("L000174");

    // A transient failure is not the same as "this person doesn't exist".
    expect(result.source).toBe("preview");
    expect(result.notice).toMatch(/temporarily unavailable/i);
  });

  it("still returns the profile when only the legislation lists fail", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: URL): Promise<Response> => {
        if (String(url).includes("legislation")) return Promise.resolve(jsonResponse({}, 500));
        return Promise.resolve(jsonResponse(liveMemberPayload()));
      }),
    );

    const result: MemberProfileResult = await getMemberProfile("L000174");

    expect(result.profile?.name).toBe("Leahy, Patrick J.");
    expect(result.sponsored).toEqual([]);
    expect(result.cosponsored).toEqual([]);
  });

  it("maps sponsored legislation into ordinary bill records", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: URL): Promise<Response> => {
        if (String(url).includes("/sponsored-legislation")) {
          return Promise.resolve(
            jsonResponse({
              sponsoredLegislation: [
                {
                  congress: 117,
                  type: "S",
                  number: "4417",
                  title: "A Sponsored Bill",
                  latestAction: { actionDate: "2022-06-16", text: "Read twice and referred to Committee." },
                },
              ],
            }),
          );
        }
        if (String(url).includes("legislation")) return Promise.resolve(jsonResponse({}));
        return Promise.resolve(jsonResponse(liveMemberPayload()));
      }),
    );

    const result: MemberProfileResult = await getMemberProfile("L000174");

    expect(result.sponsored).toHaveLength(1);
    expect(result.sponsored[0]?.title).toBe("A Sponsored Bill");
    // Mapped by the same mapper as every other bill, so it carries a public record link, not an API one.
    expect(result.sponsored[0]?.officialUrl).toBe("https://www.congress.gov/bill/117th-congress/senate-bill/4417");
  });

  it("orders legislation newest first rather than trusting the order it arrived in", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: URL): Promise<Response> => {
        if (String(url).includes("/sponsored-legislation")) {
          return Promise.resolve(
            jsonResponse({
              // Deliberately out of order, and deliberately including a record with no introduction date — which is
              // what the type's "most recent first" promise has to hold up against.
              sponsoredLegislation: [
                { congress: 117, type: "S", number: "2", title: "Middle", introducedDate: "2022-03-04" },
                { congress: 117, type: "S", number: "3", title: "Undated" },
                { congress: 117, type: "S", number: "1", title: "Newest", introducedDate: "2022-11-30" },
                { congress: 117, type: "S", number: "4", title: "Oldest", introducedDate: "2021-01-05" },
              ],
            }),
          );
        }
        if (String(url).includes("legislation")) return Promise.resolve(jsonResponse({}));
        return Promise.resolve(jsonResponse(liveMemberPayload()));
      }),
    );

    const result: MemberProfileResult = await getMemberProfile("L000174");

    expect(result.sponsored.map((bill: LegislativeBill): string => bill.title)).toEqual([
      "Newest",
      "Middle",
      "Oldest",
      "Undated",
    ]);
  });
});

describe("getMemberProfile with an unusable live payload", (): void => {
  it("treats a 200 carrying no member as nobody by that ID", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(alwaysRespond({})));

    const result: MemberProfileResult = await getMemberProfile("L000174");

    // Absent and `live`, not an outage: the request succeeded and the answer was "nobody here". The route renders that
    // as a 404, which is the truthful thing to show.
    expect(result.profile).toBeUndefined();
    expect(result.source).toBe("live");
  });

  it("treats a member record with no usable term as nobody by that ID", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    // A name but no term naming a recognizable chamber — there is no way to describe the seat, so there is no page.
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(
          alwaysRespond({ member: { bioguideId: "L000174", invertedOrderName: "Leahy, Patrick J." } }),
        ),
    );

    const result: MemberProfileResult = await getMemberProfile("L000174");

    expect(result.profile).toBeUndefined();
    expect(result.source).toBe("live");
  });
});
