/**
 * Covers each cached route under a Congress.gov outage on a production server: it refuses the render, so Next keeps the
 * last good copy instead of caching preview data for the route's window. The `/query` twins share those renders but are
 * never cached, so they still degrade to labeled preview data; `src/app/query/twins.test.tsx` covers that half, since
 * the static demo build deletes the twins.
 *
 * Nothing is rendered to the DOM: the question is only whether each route resolves or rejects.
 *
 * @see src/lib/congress/live-render.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BillPage, { generateMetadata as generateBillMetadata } from "@/app/bills/[congress]/[type]/[number]/page";
import CongressBillsPage from "@/app/bills/[congress]/page";
import BillsPage from "@/app/bills/page";
import CommitteePage, {
  generateMetadata as generateCommitteeMetadata,
} from "@/app/committees/[chamber]/[systemCode]/page";
import CommitteesPage from "@/app/committees/page";
import MemberPage, { generateMetadata as generateMemberMetadata } from "@/app/members/[bioguideId]/page";
import MembersPage from "@/app/members/page";
import HomePage from "@/app/page";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { LiveDataUnavailableError } from "@/lib/congress/live-render";
import { firstPreviewBill, previewCommitteeProfiles, previewMemberProfiles } from "@/lib/congress/upstream/fixtures";
import { jsonResponse, stubLiveApi } from "@/test/congress-api";

/** What Congress.gov answers once the key's hourly quota is spent. */
const RATE_LIMITED: Response = jsonResponse({ error: { code: "OVER_RATE_LIMIT" } }, 429);

/** A production server, past the build, whose every Congress.gov request is rate-limited. */
function stubRateLimitedProduction(): ReturnType<typeof vi.fn> {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PHASE", "phase-production-server");
  return stubLiveApi(vi.fn().mockImplementation((): Promise<Response> => Promise.resolve(RATE_LIMITED.clone())));
}

beforeEach((): void => {
  stubRateLimitedProduction();
});

afterEach((): void => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("cached routes refuse a rate-limited render", (): void => {
  const committee = previewCommitteeProfiles[0];
  const cases: [string, () => Promise<unknown>][] = [
    ["/", (): Promise<unknown> => HomePage()],
    ["/bills", (): Promise<unknown> => BillsPage()],
    ["/bills/[congress]", (): Promise<unknown> => CongressBillsPage({ params: Promise.resolve({ congress: "118" }) })],
    ["/members", (): Promise<unknown> => MembersPage()],
    ["/committees", (): Promise<unknown> => CommitteesPage()],
    [
      "/members/[bioguideId]",
      (): Promise<unknown> =>
        MemberPage({ params: Promise.resolve({ bioguideId: previewMemberProfiles[0]?.bioguideId ?? "" }) }),
    ],
    [
      "/committees/[chamber]/[systemCode]",
      (): Promise<unknown> =>
        CommitteePage({
          params: Promise.resolve({ chamber: committee?.chamber ?? "", systemCode: committee?.systemCode ?? "" }),
        }),
    ],
    [
      "/bills/[congress]/[type]/[number]",
      (): Promise<unknown> =>
        BillPage({
          params: Promise.resolve({
            congress: String(firstPreviewBill.congress),
            type: firstPreviewBill.type.toLowerCase(),
            number: firstPreviewBill.number,
          }),
        }),
    ],
  ];

  it.each(cases)("%s", async (_route: string, renderRoute: () => Promise<unknown>): Promise<void> => {
    await expect(renderRoute()).rejects.toBeInstanceOf(LiveDataUnavailableError);
  });
});

describe("the bill page under a rate limit", (): void => {
  it("refuses instead of 404ing a real bill that only failed to load", async (): Promise<void> => {
    // No fixture covers this bill, so before the refusal it rendered "Bill Not Found" — and cached that for a day.
    await expect(
      BillPage({ params: Promise.resolve({ congress: String(getCurrentCongress() - 2), type: "hr", number: "1" }) }),
    ).rejects.toBeInstanceOf(LiveDataUnavailableError);
  });

  it("stops after the lookup rather than spending eight more requests on collections", async (): Promise<void> => {
    const fetchMock = stubRateLimitedProduction();

    await BillPage({ params: Promise.resolve({ congress: "100", type: "hr", number: "1005" }) }).catch((): void => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("record metadata under a rate limit", (): void => {
  /*
   * Metadata runs its own (memoized) lookup. Answering a failure with the not-found title would put "Bill Not Found" on
   * a real bill's error page, so each refuses first, like its page.
   */
  const committee = previewCommitteeProfiles[0];
  const cases: [string, () => Promise<unknown>][] = [
    [
      "a bill",
      (): Promise<unknown> =>
        generateBillMetadata({ params: Promise.resolve({ congress: "110", type: "hr", number: "2" }) }),
    ],
    [
      "a member",
      (): Promise<unknown> => generateMemberMetadata({ params: Promise.resolve({ bioguideId: "B000444" }) }),
    ],
    [
      "a committee",
      (): Promise<unknown> =>
        generateCommitteeMetadata({
          params: Promise.resolve({ chamber: committee?.chamber ?? "", systemCode: committee?.systemCode ?? "" }),
        }),
    ],
  ];

  it.each(cases)("refuses rather than titling %s as not found", async (_record: string, read): Promise<void> => {
    await expect(read()).rejects.toBeInstanceOf(LiveDataUnavailableError);
  });
});
