/**
 * Covers search-params.ts, where a shared link becomes a starting view: malformed params resolve to defaults, the
 * static-export guard (invisible outside that build) holds, and repeated params (`?state=Ohio&state=Iowa`) are decided.
 */
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_BILL_DIRECTORY_QUERY } from "@/lib/congress/bills/search";
import { DEFAULT_COMMITTEE_DIRECTORY_QUERY } from "@/lib/congress/committees/filter";
import { DEFAULT_COMMITTEE_RECORDS_QUERY } from "@/lib/congress/committees/records";
import { ANY_FACET } from "@/lib/congress/directory-filter";
import { DEFAULT_MEMBER_DIRECTORY_QUERY } from "@/lib/congress/members/filter";
import {
  type RouteSearchParams,
  resolveBillDirectoryQuery,
  resolveCommitteeDirectoryQuery,
  resolveCommitteeRecordsQuery,
  resolveMemberDirectoryQuery,
} from "@/lib/search-params";

/** Wraps params the way a Next.js route hands them over — as a promise. */
function route(params: RouteSearchParams): Promise<RouteSearchParams> {
  return Promise.resolve(params);
}

const JURISDICTIONS: string[] = ["Ohio", "Iowa", "Vermont"];

describe("resolveBillDirectoryQuery", (): void => {
  it("reads a search and a stage out of the URL", async (): Promise<void> => {
    await expect(resolveBillDirectoryQuery(route({ q: "broadband", stage: "law" }))).resolves.toEqual({
      query: "broadband",
      stage: "law",
    });
  });

  it("returns the unsearched default for a bare URL", async (): Promise<void> => {
    await expect(resolveBillDirectoryQuery(route({}))).resolves.toEqual(DEFAULT_BILL_DIRECTORY_QUERY);
  });

  it("degrades a stale stage to no narrowing rather than an empty grid", async (): Promise<void> => {
    await expect(resolveBillDirectoryQuery(route({ q: "broadband", stage: "vetoed" }))).resolves.toEqual({
      query: "broadband",
      stage: ANY_FACET,
    });
  });

  it("takes the first of a repeated param", async (): Promise<void> => {
    // Arbitrary, but it has to be *something*: a control that holds one value cannot honor two, and rejecting the whole
    // URL would turn a duplicated param into a broken page.
    await expect(resolveBillDirectoryQuery(route({ stage: ["law", "committee"] }))).resolves.toEqual({
      query: "",
      stage: "law",
    });
  });

  it("ignores a repeated param with no values at all", async (): Promise<void> => {
    await expect(resolveBillDirectoryQuery(route({ stage: [] }))).resolves.toEqual(DEFAULT_BILL_DIRECTORY_QUERY);
  });
});

describe("resolveMemberDirectoryQuery", (): void => {
  it("reads filters and order out of the URL", async (): Promise<void> => {
    await expect(
      resolveMemberDirectoryQuery(
        route({ q: "harris", chamber: "senate", party: "democratic", state: "Ohio", sort: "state" }),
        JURISDICTIONS,
      ),
    ).resolves.toEqual({
      filters: { query: "harris", chamber: "senate", party: "democratic", state: "Ohio" },
      sort: "state",
    });
  });

  it("returns the unfiltered default for a bare URL", async (): Promise<void> => {
    await expect(resolveMemberDirectoryQuery(route({}), JURISDICTIONS)).resolves.toEqual(
      DEFAULT_MEMBER_DIRECTORY_QUERY,
    );
  });

  it("only resolves a jurisdiction the control will actually offer", async (): Promise<void> => {
    // A `?state=` naming somewhere absent from this roster has to widen rather than narrow to nothing — otherwise a
    // link shared before a delegation changed opens on an empty grid with a filter the reader cannot see or clear.
    await expect(resolveMemberDirectoryQuery(route({ state: "Atlantis" }), JURISDICTIONS)).resolves.toEqual(
      DEFAULT_MEMBER_DIRECTORY_QUERY,
    );
  });

  it("matches a jurisdiction case-insensitively, then answers in the roster's own spelling", async (): Promise<void> => {
    const resolved = await resolveMemberDirectoryQuery(route({ state: "ohio" }), JURISDICTIONS);

    expect(resolved.filters.state).toBe("Ohio");
  });

  it("degrades a stale facet or order without discarding the rest of the view", async (): Promise<void> => {
    await expect(
      resolveMemberDirectoryQuery(route({ chamber: "tribunal", party: "whig", sort: "seniority" }), JURISDICTIONS),
    ).resolves.toEqual(DEFAULT_MEMBER_DIRECTORY_QUERY);

    await expect(
      resolveMemberDirectoryQuery(route({ chamber: "senate", sort: "seniority" }), JURISDICTIONS),
    ).resolves.toEqual({
      filters: { ...DEFAULT_MEMBER_DIRECTORY_QUERY.filters, chamber: "senate" },
      sort: DEFAULT_MEMBER_DIRECTORY_QUERY.sort,
    });
  });

  it("takes the first of a repeated param", async (): Promise<void> => {
    const resolved = await resolveMemberDirectoryQuery(route({ state: ["Iowa", "Ohio"] }), JURISDICTIONS);

    expect(resolved.filters.state).toBe("Iowa");
  });
});

describe("resolveCommitteeDirectoryQuery", (): void => {
  it("reads filters and order out of the URL", async (): Promise<void> => {
    await expect(
      resolveCommitteeDirectoryQuery(route({ q: "energy", chamber: "house", type: "standing", sort: "chamber" })),
    ).resolves.toEqual({
      filters: { query: "energy", chamber: "house", type: "standing" },
      sort: "chamber",
    });
  });

  it("returns the unfiltered default for a bare URL", async (): Promise<void> => {
    await expect(resolveCommitteeDirectoryQuery(route({}))).resolves.toEqual(DEFAULT_COMMITTEE_DIRECTORY_QUERY);
  });

  it("degrades a stale type to no narrowing", async (): Promise<void> => {
    await expect(resolveCommitteeDirectoryQuery(route({ type: "subcommittee" }))).resolves.toEqual(
      DEFAULT_COMMITTEE_DIRECTORY_QUERY,
    );
  });
});

describe("resolveCommitteeRecordsQuery", (): void => {
  it("reads which collection to show and how far into it", async (): Promise<void> => {
    await expect(resolveCommitteeRecordsQuery(route({ records: "nominations", page: "6" }))).resolves.toEqual({
      kind: "nominations",
      page: 6,
    });
  });

  it("returns the first page of referred bills for a bare committee URL", async (): Promise<void> => {
    await expect(resolveCommitteeRecordsQuery(route({}))).resolves.toEqual(DEFAULT_COMMITTEE_RECORDS_QUERY);
  });

  it("degrades a stale or hand-edited param rather than failing the page", async (): Promise<void> => {
    await expect(resolveCommitteeRecordsQuery(route({ records: "hearings", page: "-2" }))).resolves.toEqual(
      DEFAULT_COMMITTEE_RECORDS_QUERY,
    );
  });

  it("collapses a repeated param to its first value, as the directories do", async (): Promise<void> => {
    await expect(resolveCommitteeRecordsQuery(route({ records: ["reports", "nominations"] }))).resolves.toMatchObject({
      kind: "reports",
    });
  });
});

describe("in a static export", (): void => {
  // No server survives to request time, so there is no request to read. Every deep link degrades to the page's own
  // default view — the page still works, it just cannot be pre-filled from the URL, and the directory adopts the
  // address bar in the browser instead. See the mount case in useDirectoryUrlSync.
  it("hands over each directory's default view rather than reading the request", async (): Promise<void> => {
    vi.stubEnv("STATIC_EXPORT", "true");

    await expect(resolveBillDirectoryQuery(route({ q: "broadband", stage: "law" }))).resolves.toEqual(
      DEFAULT_BILL_DIRECTORY_QUERY,
    );
    await expect(resolveMemberDirectoryQuery(route({ chamber: "senate" }), JURISDICTIONS)).resolves.toEqual(
      DEFAULT_MEMBER_DIRECTORY_QUERY,
    );
    await expect(resolveCommitteeDirectoryQuery(route({ type: "standing" }))).resolves.toEqual(
      DEFAULT_COMMITTEE_DIRECTORY_QUERY,
    );
    await expect(resolveCommitteeRecordsQuery(route({ records: "reports", page: "4" }))).resolves.toEqual(
      DEFAULT_COMMITTEE_RECORDS_QUERY,
    );
  });

  it("reads the request normally for any other value of the flag", async (): Promise<void> => {
    // Only the exact string "true" switches the static build on, matching next.config.ts — so a stray "1" or "false"
    // must not silently disable deep links on the real server deployment.
    vi.stubEnv("STATIC_EXPORT", "false");

    await expect(resolveBillDirectoryQuery(route({ stage: "law" }))).resolves.toEqual({ query: "", stage: "law" });
  });
});
