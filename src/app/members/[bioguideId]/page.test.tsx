/**
 * Covers the individual member route.
 *
 * The metadata here has a branch the other detail routes don't: a member with no resolvable seat falls back to naming
 * their chamber, because "representing " with nothing after it is worse than the plainer sentence. Both sides of that
 * are exercised. The rest is the same contract every record route keeps — the page renders, a preview record says so,
 * and an ID nobody holds is a 404 rather than an empty profile.
 */
import { render, screen } from "@testing-library/react";
import type { Metadata } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MemberPage, { generateMetadata, generateStaticParams } from "@/app/members/[bioguideId]/page";
import { chamberLabels, formatMemberName, formatMemberTitle, type MemberProfile } from "@/lib/congress/members/model";
import { previewMemberProfiles } from "@/lib/congress/upstream/fixtures";
import { memberHref } from "@/lib/member-route";
import { expectNotFound } from "@/test/next-not-found";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

/** The first preview profile, non-null-asserted once here under `noUncheckedIndexedAccess`. */
const firstProfile: MemberProfile = previewMemberProfiles[0] as MemberProfile;

beforeEach((): void => {
  delete process.env.CONGRESS_API_KEY;
});

afterEach((): void => {
  vi.unstubAllGlobals();
  if (originalApiKey === undefined) delete process.env.CONGRESS_API_KEY;
  else process.env.CONGRESS_API_KEY = originalApiKey;
});

describe("generateStaticParams", (): void => {
  it("emits one entry per preview member, so every fixture sponsor links somewhere real", (): void => {
    expect(generateStaticParams()).toEqual(
      previewMemberProfiles.map((profile: MemberProfile): { bioguideId: string } => ({
        bioguideId: profile.bioguideId,
      })),
    );
  });
});

describe("generateMetadata", (): void => {
  it("titles the page with the member's name and their title", async (): Promise<void> => {
    const metadata: Metadata = await generateMetadata({
      params: Promise.resolve({ bioguideId: firstProfile.bioguideId }),
    });

    expect(metadata.title).toBe(`${formatMemberName(firstProfile)} — ${formatMemberTitle(firstProfile)}`);
    expect(metadata.alternates?.canonical).toBe(memberHref(firstProfile.bioguideId));
  });

  it("describes the member by the seat they hold", async (): Promise<void> => {
    const metadata: Metadata = await generateMetadata({
      params: Promise.resolve({ bioguideId: firstProfile.bioguideId }),
    });

    expect(metadata.description).toMatch(new RegExp(`^${formatMemberTitle(firstProfile)} representing .+\\.$`));
  });

  it("names the chamber instead when no seat can be derived", async (): Promise<void> => {
    // "…representing ." with nothing after it is worse than the plainer sentence, so a member whose jurisdiction is not
    // on file is described by the body they sit in. No fixture is seatless, so this one goes through the live path with
    // a record that carries no state.
    process.env.CONGRESS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (): Promise<Response> =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                member: {
                  bioguideId: "L000174",
                  invertedOrderName: "Leahy, Patrick J.",
                  partyName: "Democratic",
                  currentMember: true,
                  terms: [{ chamber: "Senate", congress: 117, startYear: 2021 }],
                },
              }),
              { headers: { "Content-Type": "application/json" } },
            ),
          ),
      ),
    );

    const metadata: Metadata = await generateMetadata({ params: Promise.resolve({ bioguideId: "L000174" }) });

    expect(metadata.description).toBe(chamberLabels.senate);
    expect(metadata.description).not.toMatch(/representing\s*\.$/);
  });

  it("returns noindex not-found tags for an ID nobody holds", async (): Promise<void> => {
    const metadata: Metadata = await generateMetadata({ params: Promise.resolve({ bioguideId: "PREVIEW-NOBODY" }) });

    expect(metadata.title).toBe("Member Not Found");
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});

describe("MemberPage", (): void => {
  it("renders the member's record", async (): Promise<void> => {
    render(await MemberPage({ params: Promise.resolve({ bioguideId: firstProfile.bioguideId }) }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(formatMemberName(firstProfile));
  });

  it("renders every preview member, so no fixture sponsor links to a dead page", async (): Promise<void> => {
    for (const profile of previewMemberProfiles) {
      const { unmount } = render(await MemberPage({ params: Promise.resolve({ bioguideId: profile.bioguideId }) }));

      expect(screen.getByRole("heading", { level: 1 }), profile.bioguideId).toHaveTextContent(
        formatMemberName(profile),
      );
      unmount();
    }
  });

  it("labels a preview profile rather than presenting a fixture as a real person's record", async (): Promise<void> => {
    render(await MemberPage({ params: Promise.resolve({ bioguideId: firstProfile.bioguideId }) }));

    expect(screen.getByText("Preview Data")).toBeInTheDocument();
  });

  it("shows the bills the fixture member sponsored", async (): Promise<void> => {
    render(await MemberPage({ params: Promise.resolve({ bioguideId: firstProfile.bioguideId }) }));

    // The fixtures derive sponsorship from the preview bills themselves, so a member page and the bill naming them as
    // sponsor cannot disagree.
    expect(screen.getByText("Community Water Reliability Act")).toBeInTheDocument();
  });

  it("resolves a preview ID case-insensitively", async (): Promise<void> => {
    render(await MemberPage({ params: Promise.resolve({ bioguideId: firstProfile.bioguideId.toLowerCase() }) }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(formatMemberName(firstProfile));
  });

  it("404s for an ID that resolves to nobody", async (): Promise<void> => {
    await expectNotFound((): Promise<unknown> => {
      return MemberPage({ params: Promise.resolve({ bioguideId: "PREVIEW-NOBODY" }) });
    });
  });

  it("404s for a malformed ID rather than sending it upstream", async (): Promise<void> => {
    // These fail `isBioguideId`, which is the guard that keeps a route-derived value out of an outbound URL.
    for (const bioguideId of ["", "../secrets", "L00017", "12345678"]) {
      await expectNotFound((): Promise<unknown> => MemberPage({ params: Promise.resolve({ bioguideId }) }));
    }
  });
});
