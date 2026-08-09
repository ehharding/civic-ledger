/**
 * Covers getMemberDirectory's two paths and the reshaping rule underneath them: the no-key preview fallback, the live
 * flattening of two chambers into one alphabetical roster, and the boundary that drops a member who couldn't be linked
 * to.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildMemberDirectory, getMemberDirectory, type MemberDirectoryResult } from "@/lib/congress/client";
import { previewMemberProfiles } from "@/lib/congress/fixtures";
import {
  buildChamberComposition,
  type CongressComposition,
  type CongressMember,
  type MemberDirectoryEntry,
} from "@/lib/congress/members";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A live member-list payload, in the shape the list endpoint actually returns. */
function liveMemberListPayload(members: Record<string, unknown>[]): Record<string, unknown> {
  return {
    members,
    pagination: { count: members.length },
  };
}

function liveMember(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    bioguideId: "B000001",
    name: "Bennett, Marcus T.",
    partyName: "Democratic",
    state: "Ohio",
    district: 9,
    terms: { item: [{ chamber: "House of Representatives" }] },
    ...overrides,
  };
}

function composition(members: CongressMember[], chamber: "house" | "senate" = "house"): CongressComposition {
  return {
    congress: 119,
    chambers: [
      buildChamberComposition("house", chamber === "house" ? members : []),
      buildChamberComposition("senate", chamber === "senate" ? members : []),
    ],
    source: "live",
    retrievedAt: "2026-07-28T00:00:00.000Z",
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

describe("buildMemberDirectory", (): void => {
  it("flattens both chambers into one alphabetical roster", (): void => {
    const result: MemberDirectoryEntry[] = buildMemberDirectory({
      congress: 119,
      chambers: [
        buildChamberComposition("house", [{ bioguideId: "W000001", name: "Whitmore, Louise B.", party: "republican" }]),
        buildChamberComposition("senate", [{ bioguideId: "A000002", name: "Alvarez, Priya R.", party: "republican" }]),
      ],
      source: "live",
      retrievedAt: "2026-07-28T00:00:00.000Z",
    });

    expect(result.map((entry: MemberDirectoryEntry): string => entry.name)).toEqual([
      "Alvarez, Priya R.",
      "Whitmore, Louise B.",
    ]);
  });

  it("carries the chamber down onto each row, since a flat list has no grouping to imply it", (): void => {
    const result: MemberDirectoryEntry[] = buildMemberDirectory({
      congress: 119,
      chambers: [
        buildChamberComposition("house", [{ bioguideId: "B000001", name: "Bennett, Marcus T.", party: "democratic" }]),
        buildChamberComposition("senate", [{ bioguideId: "A000002", name: "Alvarez, Priya R.", party: "republican" }]),
      ],
      source: "live",
      retrievedAt: "2026-07-28T00:00:00.000Z",
    });

    expect(result.find((entry: MemberDirectoryEntry): boolean => entry.name.startsWith("Alvarez"))?.chamber).toBe(
      "senate",
    );
    expect(result.find((entry: MemberDirectoryEntry): boolean => entry.name.startsWith("Bennett"))?.chamber).toBe(
      "house",
    );
  });

  it("carries the portrait down onto each row, which is the whole reason the composition holds one", (): void => {
    const result: MemberDirectoryEntry[] = buildMemberDirectory(
      composition([
        {
          bioguideId: "B000001",
          name: "Bennett, Marcus T.",
          party: "democratic",
          depiction: { imageUrl: "https://www.congress.gov/img/member/b000001_200.jpg" },
        },
      ]),
    );

    expect(result[0]?.depiction?.imageUrl).toBe("https://www.congress.gov/img/member/b000001_200.jpg");
  });

  it("drops a member with no Bioguide ID, since the row could not be opened", (): void => {
    const result: MemberDirectoryEntry[] = buildMemberDirectory(
      composition([
        { bioguideId: "B000001", name: "Bennett, Marcus T.", party: "democratic" },
        { name: "Preview Seat 2", party: "republican" },
      ]),
    );

    expect(result.map((entry: MemberDirectoryEntry): string => entry.name)).toEqual(["Bennett, Marcus T."]);
  });

  it("sorts names carrying diacritics where a reader expects, not by code point", (): void => {
    const result: MemberDirectoryEntry[] = buildMemberDirectory(
      composition([
        { bioguideId: "Z000003", name: "Zamora, Luis", party: "democratic" },
        { bioguideId: "M000004", name: "Muñoz, Elena", party: "democratic" },
        { bioguideId: "M000005", name: "Munson, Clara", party: "republican" },
      ]),
    );

    // A raw code-point sort would put "Muñoz" after "Munson", since ñ sits above z in Unicode.
    expect(result.map((entry: MemberDirectoryEntry): string => entry.name)).toEqual([
      "Muñoz, Elena",
      "Munson, Clara",
      "Zamora, Luis",
    ]);
  });

  it("returns an empty roster for an empty composition rather than throwing", (): void => {
    expect(buildMemberDirectory(composition([]))).toEqual([]);
  });
});

describe("getMemberDirectory without an API key", (): void => {
  it("falls back to the placeholder people and labels them as such", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const result: MemberDirectoryResult = await getMemberDirectory();

    expect(result.source).toBe("preview");
    expect(result.members).toHaveLength(previewMemberProfiles.length);
    expect(result.notice).toMatch(/not a roster of Congress/i);
  });

  it("offers placeholder rows that resolve to real member pages, not dead links", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const result: MemberDirectoryResult = await getMemberDirectory();
    const known: Set<string> = new Set(previewMemberProfiles.map((profile): string => profile.bioguideId));

    expect(result.members.every((entry: MemberDirectoryEntry): boolean => known.has(entry.bioguideId))).toBe(true);
  });

  it("gives no placeholder a portrait, so a fiction never wears a real person's face", async (): Promise<void> => {
    // The sharpest form of the preview-data rule: a placeholder with a photograph is the single most convincing way
    // this app's fiction could be taken for the record, far more so than a plausible name or a fabricated deep link.
    // Held here rather than only in the fixtures, so adding a portrait to one would fail a test that says why.
    // @see docs/data-policy.md, "Preview Data Is Labeled Fiction".
    delete process.env.CONGRESS_API_KEY;

    const result: MemberDirectoryResult = await getMemberDirectory();

    expect(result.members.every((entry: MemberDirectoryEntry): boolean => entry.depiction === undefined)).toBe(true);
  });

  it("orders the placeholder roster alphabetically, like the live one", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const names: string[] = (await getMemberDirectory()).members.map(
      (entry: MemberDirectoryEntry): string => entry.name,
    );

    expect(names).toEqual([...names].sort((a: string, b: string): number => a.localeCompare(b)));
  });
});

describe("getMemberDirectory with an API key", (): void => {
  it("maps a live roster and reports it as live", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        liveMemberListPayload([
          liveMember(),
          liveMember({
            bioguideId: "A000002",
            name: "Alvarez, Priya R.",
            partyName: "Republican",
            state: "Arizona",
            district: undefined,
            terms: { item: [{ chamber: "Senate" }] },
          }),
        ]),
      ),
    );

    const result: MemberDirectoryResult = await getMemberDirectory(119);

    expect(result.source).toBe("live");
    expect(result.congress).toBe(119);
    expect(result.members.map((entry: MemberDirectoryEntry): string => entry.name)).toEqual([
      "Alvarez, Priya R.",
      "Bennett, Marcus T.",
    ]);
  });

  it("falls back to placeholders when the roster can't be read, rather than showing an empty directory", async (): Promise<void> => {
    process.env.CONGRESS_API_KEY = "test-key";
    // The adapter logs upstream failures by design; this one is deliberate, so it shouldn't look like a real fault in
    // the test output.
    vi.spyOn(console, "error").mockImplementation((): void => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "boom" }, 500));

    const result: MemberDirectoryResult = await getMemberDirectory(119);

    expect(result.source).toBe("preview");
    expect(result.members.length).toBeGreaterThan(0);
  });
});
