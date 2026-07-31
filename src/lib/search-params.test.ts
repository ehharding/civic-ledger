/**
 * Covers search-params.ts, the point where a shared link becomes a starting view.
 *
 * Two things here are worth pinning rather than trusting. The first is the contract every parser beneath this module
 * already holds — that a malformed, stale, or hand-edited param resolves to a usable default rather than an error —
 * since a deep link is exactly the kind of URL that gets truncated by a chat client or opened a year later against a
 * roster that has since changed. The second is the static-export guard, which is invisible in normal development: it
 * only does anything in a build that has no server at request time, so nothing in local use or in the Playwright suite
 * would notice if it stopped working.
 *
 * The repeated-param case (`?state=Ohio&state=Iowa`) gets its own coverage because it is the one input shape a route's
 * `searchParams` can take that a `URLSearchParams` cannot, and so the one this module genuinely has to decide about.
 */
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_COMMITTEE_DIRECTORY_QUERY } from "@/lib/congress/committee-filter";
import { ANY_FACET } from "@/lib/congress/directory-filter";
import { DEFAULT_MEMBER_DIRECTORY_QUERY } from "@/lib/congress/member-filter";
import { DEFAULT_BILL_DIRECTORY_QUERY } from "@/lib/congress/search";
import {
  type RouteSearchParams,
  resolveBillDirectoryQuery,
  resolveCommitteeDirectoryQuery,
  resolveMemberDirectoryQuery,
} from "@/lib/search-params";

/** Wraps params the way a Next.js route hands them over — as a promise. */
function route(params: RouteSearchParams): Promise<RouteSearchParams> {
  return Promise.resolve(params);
}

const JURISDICTIONS: string[] = ["Ohio", "Iowa", "Vermont"];

afterEach((): void => {
  delete process.env.STATIC_EXPORT;
});

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
    // Arbitrary, but it has to be *something*: a control that holds one value cannot honor two, and rejecting the
    // whole URL would turn a duplicated param into a broken page.
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

describe("in a static export", (): void => {
  // No server survives to request time, so there is no request to read. Every deep link degrades to the page's own
  // default view — the page still works, it just cannot be pre-filled from the URL, and the directory adopts the
  // address bar in the browser instead. @see the mount case in useDirectoryUrlSync.
  it("hands over each directory's default view rather than reading the request", async (): Promise<void> => {
    process.env.STATIC_EXPORT = "true";

    await expect(resolveBillDirectoryQuery(route({ q: "broadband", stage: "law" }))).resolves.toEqual(
      DEFAULT_BILL_DIRECTORY_QUERY,
    );
    await expect(resolveMemberDirectoryQuery(route({ chamber: "senate" }), JURISDICTIONS)).resolves.toEqual(
      DEFAULT_MEMBER_DIRECTORY_QUERY,
    );
    await expect(resolveCommitteeDirectoryQuery(route({ type: "standing" }))).resolves.toEqual(
      DEFAULT_COMMITTEE_DIRECTORY_QUERY,
    );
  });

  it("reads the request normally for any other value of the flag", async (): Promise<void> => {
    // Only the exact string "true" switches the static build on, matching next.config.ts — so a stray "1" or "false"
    // must not silently disable deep links on the real server deployment.
    process.env.STATIC_EXPORT = "false";

    await expect(resolveBillDirectoryQuery(route({ stage: "law" }))).resolves.toEqual({ query: "", stage: "law" });
  });
});
