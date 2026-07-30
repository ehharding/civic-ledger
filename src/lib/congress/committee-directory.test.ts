/**
 * Covers the committee adapter end to end: the mappers that turn upstream records into the app's model, the
 * subcommittee-folding rule the directory is built on, and both fetchers' preview fallbacks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildCommitteeDirectory, type CommitteeDirectoryResult, getCommitteeDirectory } from "@/lib/congress/client";
import { type CommitteeProfileResult, getCommitteeProfile } from "@/lib/congress/committee-profile";
import type { CommitteeProfile, CommitteeSummary } from "@/lib/congress/committees";
import { findPreviewCommitteeProfile, previewCommitteeDirectory } from "@/lib/congress/fixtures";
import { mapCommitteeProfile, mapCommitteeRef, mapCongressCommittee } from "@/lib/congress/mappers";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A raw committee record, in the shape the list endpoint actually returns. */
function liveCommittee(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    systemCode: "hsag00",
    name: "Agriculture Committee",
    chamber: "House",
    committeeTypeCode: "Standing",
    ...overrides,
  };
}

beforeEach((): void => {
  vi.restoreAllMocks();
  process.env.CONGRESS_API_KEY = "test-key";
});

afterEach((): void => {
  if (originalApiKey === undefined) delete process.env.CONGRESS_API_KEY;
  else process.env.CONGRESS_API_KEY = originalApiKey;
});

describe("mapCommitteeRef", (): void => {
  it("maps a reference carrying both a code and a name", (): void => {
    expect(mapCommitteeRef({ systemCode: "HSAG14", name: "Livestock Subcommittee" })).toEqual({
      systemCode: "hsag14",
      name: "Livestock Subcommittee",
    });
  });

  /* A subcommittee with no code cannot be opened and one with no name cannot be labeled. */
  it("drops a reference missing either half", (): void => {
    expect(mapCommitteeRef({ systemCode: "hsag14" })).toBeNull();
    expect(mapCommitteeRef({ name: "Livestock Subcommittee" })).toBeNull();
    expect(mapCommitteeRef({ systemCode: "  ", name: "  " })).toBeNull();
  });
});

describe("mapCongressCommittee", (): void => {
  it("maps a usable list record", (): void => {
    expect(mapCongressCommittee(liveCommittee())).toEqual({
      systemCode: "hsag00",
      name: "Agriculture Committee",
      chamber: "house",
      type: "standing",
      typeName: "Standing",
      parent: undefined,
      subcommitteeCount: 0,
    });
  });

  it("lower-cases the system code, since it is also a URL path segment", (): void => {
    expect(mapCongressCommittee(liveCommittee({ systemCode: "HSAG00" }))?.systemCode).toBe("hsag00");
  });

  it("counts only the subcommittees that could themselves be mapped", (): void => {
    const mapped: CommitteeSummary | null = mapCongressCommittee(
      liveCommittee({
        subcommittees: [
          { systemCode: "hsag14", name: "Livestock Subcommittee" },
          { systemCode: "hsag15", name: "Conservation Subcommittee" },
          // Unopenable, so it isn't counted as something a reader could reach.
          { name: "Nameless" },
        ],
      }),
    );

    expect(mapped?.subcommitteeCount).toBe(2);
  });

  it("carries the parent through for a subcommittee record", (): void => {
    const mapped: CommitteeSummary | null = mapCongressCommittee(
      liveCommittee({
        systemCode: "hsag14",
        name: "Livestock Subcommittee",
        parent: { systemCode: "hsag00", name: "Agriculture Committee" },
      }),
    );

    expect(mapped?.parent).toEqual({ systemCode: "hsag00", name: "Agriculture Committee" });
  });

  it("keeps the verbatim upstream type label alongside the grouped one", (): void => {
    const mapped: CommitteeSummary | null = mapCongressCommittee(
      liveCommittee({ committeeTypeCode: "Commission or Caucus" }),
    );

    expect(mapped?.type).toBe("commission");
    expect(mapped?.typeName).toBe("Commission or Caucus");
  });

  it("accepts the item endpoint's `type` spelling as well as the list's `committeeTypeCode`", (): void => {
    const mapped: CommitteeSummary | null = mapCongressCommittee(
      liveCommittee({ committeeTypeCode: undefined, type: "Select" }),
    );

    expect(mapped?.type).toBe("select");
  });

  it("drops a record with no code, no name, or no recognizable chamber", (): void => {
    expect(mapCongressCommittee(liveCommittee({ systemCode: undefined }))).toBeNull();
    expect(mapCongressCommittee(liveCommittee({ name: "   " }))).toBeNull();
    expect(mapCongressCommittee(liveCommittee({ chamber: "NoChamber" }))).toBeNull();
  });
});

describe("mapCommitteeProfile", (): void => {
  const history: Record<string, unknown>[] = [
    {
      officialName: "Committee on Education and Labor",
      startDate: "1947-01-03T00:00:00Z",
      endDate: "1995-01-03T00:00:00Z",
    },
    { officialName: "Committee on Education and the Workforce", startDate: "1995-01-04T00:00:00Z" },
  ];

  /*
   * The item endpoint returns neither a chamber nor a name. Both have to be resolved here — the chamber from the path
   * that was requested, the name from the most recent history entry — and getting either wrong renders a page that
   * contradicts the URL that reached it.
   */
  it("takes the name from the most recent history entry and the chamber from the request", (): void => {
    const profile: CommitteeProfile | null = mapCommitteeProfile({ history }, "hsed00", "house");

    expect(profile?.name).toBe("Committee on Education and the Workforce");
    expect(profile?.chamber).toBe("house");
  });

  it("orders history newest first", (): void => {
    const profile: CommitteeProfile | null = mapCommitteeProfile({ history }, "hsed00", "house");

    expect(profile?.history.map((entry: { name: string }): string => entry.name)).toEqual([
      "Committee on Education and the Workforce",
      "Committee on Education and Labor",
    ]);
  });

  it("falls back to the Library of Congress name when there is no official one", (): void => {
    const profile: CommitteeProfile | null = mapCommitteeProfile(
      { history: [{ libraryOfCongressName: "Agriculture", startDate: "1975-01-14T00:00:00Z" }] },
      "hsag00",
      "house",
    );

    expect(profile?.name).toBe("Agriculture");
    // Not carried separately, because it is already the name — printing it twice would read as two facts.
    expect(profile?.history[0]?.libraryName).toBeUndefined();
  });

  it("carries the Library of Congress name only when it says something the official one didn't", (): void => {
    const profile: CommitteeProfile | null = mapCommitteeProfile(
      {
        history: [
          {
            officialName: "Committee on Agriculture",
            libraryOfCongressName: "Agriculture",
            startDate: "1975-01-14T00:00:00Z",
          },
        ],
      },
      "hsag00",
      "house",
    );

    expect(profile?.history[0]?.libraryName).toBe("Agriculture");
  });

  it("sorts subcommittees alphabetically and counts them", (): void => {
    const profile: CommitteeProfile | null = mapCommitteeProfile(
      {
        history,
        subcommittees: [
          { systemCode: "hsed15", name: "Workforce Protections Subcommittee" },
          { systemCode: "hsed14", name: "Early Childhood Subcommittee" },
        ],
      },
      "hsed00",
      "house",
    );

    expect(profile?.subcommittees.map((entry: { name: string }): string => entry.name)).toEqual([
      "Early Childhood Subcommittee",
      "Workforce Protections Subcommittee",
    ]);
    expect(profile?.subcommitteeCount).toBe(2);
  });

  it("reads the record counts", (): void => {
    const profile: CommitteeProfile | null = mapCommitteeProfile(
      { history, bills: { count: 4821 }, reports: { count: 219 }, nominations: { count: 12 } },
      "hsed00",
      "house",
    );

    expect(profile?.billCount).toBe(4821);
    expect(profile?.reportCount).toBe(219);
    expect(profile?.nominationCount).toBe(12);
  });

  /* Absent means "the API didn't say", which for a committee record it only does for bodies no longer constituted. */
  it("treats an absent isCurrent as no longer active", (): void => {
    expect(mapCommitteeProfile({ history }, "hsed00", "house")?.isCurrent).toBe(false);
    expect(mapCommitteeProfile({ history, isCurrent: true }, "hsed00", "house")?.isCurrent).toBe(true);
  });

  /* With no name there is nothing to title the page with, and a name guessed from the system code is a fabrication. */
  it("returns null when no history entry names the committee", (): void => {
    expect(mapCommitteeProfile({ history: [] }, "hsed00", "house")).toBeNull();
    expect(mapCommitteeProfile({}, "hsed00", "house")).toBeNull();
    expect(mapCommitteeProfile({ history: [{ startDate: "1947-01-03T00:00:00Z" }] }, "hsed00", "house")).toBeNull();
  });
});

describe("buildCommitteeDirectory", (): void => {
  /*
   * The substance of the directory. The list endpoint returns subcommittees as peers of their parents, and rendering
   * that flat would put a subcommittee in the same alphabetical run as the Judiciary Committee as though the two were
   * comparable bodies.
   */
  it("keeps parent committees and folds subcommittees away", (): void => {
    const rows: CommitteeSummary[] = buildCommitteeDirectory([
      liveCommittee(),
      liveCommittee({
        systemCode: "hsag14",
        name: "Livestock Subcommittee",
        parent: { systemCode: "hsag00", name: "Agriculture Committee" },
      }),
    ]);

    expect(rows.map((row: CommitteeSummary): string => row.systemCode)).toEqual(["hsag00"]);
  });

  it("orders alphabetically across chambers", (): void => {
    const rows: CommitteeSummary[] = buildCommitteeDirectory([
      liveCommittee({ systemCode: "hsru00", name: "Rules Committee" }),
      liveCommittee({ systemCode: "ssap00", name: "Appropriations Committee", chamber: "Senate" }),
      liveCommittee(),
    ]);

    expect(rows.map((row: CommitteeSummary): string => row.name)).toEqual([
      "Agriculture Committee",
      "Appropriations Committee",
      "Rules Committee",
    ]);
  });

  it("drops records that couldn't be mapped rather than rendering unopenable cards", (): void => {
    expect(buildCommitteeDirectory([liveCommittee({ systemCode: undefined }), liveCommittee()])).toHaveLength(1);
  });

  it("returns an empty list for an empty payload", (): void => {
    expect(buildCommitteeDirectory([])).toEqual([]);
  });
});

describe("getCommitteeDirectory", (): void => {
  it("returns the labeled preview list when no key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const result: CommitteeDirectoryResult = await getCommitteeDirectory(119);

    expect(result.source).toBe("preview");
    expect(result.notice).toContain("placeholder");
    expect(result.committees).toEqual(previewCommitteeDirectory());
  });

  it("returns the live list when the fetch succeeds", async (): Promise<void> => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ committees: [liveCommittee()], pagination: { count: 1 } }),
    );

    const result: CommitteeDirectoryResult = await getCommitteeDirectory(119);

    expect(result.source).toBe("live");
    expect(result.congress).toBe(119);
    expect(result.committees.map((row: CommitteeSummary): string => row.name)).toEqual(["Agriculture Committee"]);
  });

  /* "This Congress has no committees" is never a true statement, so an empty result is a failed fetch. */
  it("falls back to preview rather than rendering an empty directory", async (): Promise<void> => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ committees: [], pagination: { count: 0 } }));

    const result: CommitteeDirectoryResult = await getCommitteeDirectory(119);

    expect(result.source).toBe("preview");
    expect(result.notice).toContain("temporarily unavailable");
  });

  it("falls back to preview on an upstream failure rather than throwing", async (): Promise<void> => {
    vi.spyOn(console, "error").mockImplementation((): void => undefined);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(getCommitteeDirectory(119)).resolves.toMatchObject({ source: "preview" });
  });
});

describe("getCommitteeProfile", (): void => {
  it("maps a live record", async (): Promise<void> => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        committee: {
          systemCode: "hsag00",
          type: "Standing",
          isCurrent: true,
          history: [{ officialName: "Committee on Agriculture", startDate: "1975-01-14T00:00:00Z" }],
        },
      }),
    );

    const result: CommitteeProfileResult = await getCommitteeProfile("house", "hsag00");

    expect(result.source).toBe("live");
    expect(result.profile?.name).toBe("Committee on Agriculture");
    expect(result.profile?.chamber).toBe("house");
  });

  it("asks the chamber-and-code endpoint, with the code lower-cased", async (): Promise<void> => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ committee: { history: [{ officialName: "Committee on Agriculture" }] } }));

    await getCommitteeProfile("HOUSE", "HSAG00");

    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/committee/house/hsag00");
  });

  /* A 404 is a true answer — no such committee — and the route renders it as one. */
  it("reports an unknown committee as absent rather than as a failure", async (): Promise<void> => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 404));

    const result: CommitteeProfileResult = await getCommitteeProfile("house", "hsxx00");

    expect(result.source).toBe("live");
    expect(result.profile).toBeUndefined();
  });

  /*
   * A malformed identifier is a bad URL rather than a configuration problem, and the notice says so — a distinction
   * that matters the first time this wording becomes reachable.
   */
  it("never sends a malformed identifier upstream", async (): Promise<void> => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const badCode: CommitteeProfileResult = await getCommitteeProfile("house", "../bill/119");
    const badChamber: CommitteeProfileResult = await getCommitteeProfile("assembly", "hsag00");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(badCode.profile).toBeUndefined();
    expect(badCode.notice).toContain("not a valid committee identifier");
    expect(badChamber.profile).toBeUndefined();
  });

  it("resolves a preview committee when no key is configured", async (): Promise<void> => {
    delete process.env.CONGRESS_API_KEY;

    const result: CommitteeProfileResult = await getCommitteeProfile("house", "preview-01");

    expect(result.source).toBe("preview");
    expect(result.profile?.name).toBe("Preview Public Works Committee");
    expect(result.notice).toContain("placeholder");
  });

  /*
   * A transient failure rendering as a 404 would tell a reader something false about the record, so the fallback is
   * the labeled preview path rather than "not found". No fixture carries a real-shaped code — that is deliberate, so a
   * placeholder can never be presented as a real committee — so what a reader sees here is the route's 404. That is
   * the same behavior `getMemberProfile` has had for a real Bioguide ID, and it is the notice, not the profile, that
   * distinguishes this branch from a genuine 404 for anything downstream that reads it.
   */
  it("falls back to the preview path on an upstream failure rather than reporting a 404", async (): Promise<void> => {
    vi.spyOn(console, "error").mockImplementation((): void => undefined);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const result: CommitteeProfileResult = await getCommitteeProfile("house", "hsag00");

    expect(result.source).toBe("preview");
    expect(result.notice).toContain("temporarily unavailable");
  });

  /* A preview code never reaches the network at all — it fails the guard and resolves against the fixtures. */
  it("resolves a preview code without a request, even with a key configured", async (): Promise<void> => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result: CommitteeProfileResult = await getCommitteeProfile("house", "preview-01");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.profile?.name).toBe("Preview Public Works Committee");
  });
});

describe("the preview committee fixtures", (): void => {
  it("derives the directory from the profiles, so the two can't disagree", (): void => {
    const codes: string[] = previewCommitteeDirectory().map((row: CommitteeSummary): string => row.systemCode);

    for (const code of codes) {
      expect(
        findPreviewCommitteeProfile("house", code) ??
          findPreviewCommitteeProfile("senate", code) ??
          findPreviewCommitteeProfile("joint", code),
      ).toBeDefined();
    }
  });

  /* A committee's chamber is part of its identity: resolving the wrong one would contradict the URL that reached it. */
  it("matches on chamber as well as code", (): void => {
    expect(findPreviewCommitteeProfile("house", "preview-01")).toBeDefined();
    expect(findPreviewCommitteeProfile("senate", "preview-01")).toBeUndefined();
  });

  /* A parent's page links to each subcommittee, and a link that 404s makes the fixtures look broken. */
  it("resolves a preview subcommittee, promoted to a profile of its own", (): void => {
    const child: CommitteeProfile | undefined = findPreviewCommitteeProfile("house", "preview-01a");

    expect(child?.name).toBe("Preview Subcommittee on Bridges");
    expect(child?.parent?.systemCode).toBe("preview-01");
    expect(child?.subcommittees).toEqual([]);
  });

  it("returns undefined for a code nothing carries", (): void => {
    expect(findPreviewCommitteeProfile("house", "preview-99")).toBeUndefined();
  });
});
