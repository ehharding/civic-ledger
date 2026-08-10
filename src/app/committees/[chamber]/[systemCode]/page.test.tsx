/**
 * Covers the individual committee route.
 *
 * Both segments are part of the identifier, not one plus decoration — Congress.gov's committee endpoint is keyed on
 * chamber *and* system code. So the case that matters most here is the mismatched pair: `/committees/senate/preview-01`
 * names a real code under the wrong chamber, and resolving it would render a page contradicting the URL that reached
 * it. That has to be a 404, not a near miss.
 */
import { render, screen } from "@testing-library/react";
import type { Metadata } from "next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import CommitteePage, { generateMetadata, generateStaticParams } from "@/app/committees/[chamber]/[systemCode]/page";
import { committeeHref } from "@/lib/committee-route";
import { type CommitteeProfile, describeCommittee } from "@/lib/congress/committees/model";
import { previewCommitteeProfiles } from "@/lib/congress/upstream/fixtures";
import { expectNotFound } from "@/test/next-not-found";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

/** The first preview committee — a House standing committee with two subcommittees. */
const firstCommittee: CommitteeProfile = previewCommitteeProfiles[0] as CommitteeProfile;

beforeEach((): void => {
  delete process.env.CONGRESS_API_KEY;
});

afterEach((): void => {
  if (originalApiKey === undefined) delete process.env.CONGRESS_API_KEY;
  else process.env.CONGRESS_API_KEY = originalApiKey;
});

describe("generateStaticParams", (): void => {
  it("emits an entry for every preview committee", (): void => {
    const params: { chamber: string; systemCode: string }[] = generateStaticParams();

    for (const profile of previewCommitteeProfiles) {
      expect(params, profile.systemCode).toContainEqual({ chamber: profile.chamber, systemCode: profile.systemCode });
    }
  });

  it("emits subcommittees alongside their parents, so a parent's links do not 404 in the static demo", (): void => {
    const params: { chamber: string; systemCode: string }[] = generateStaticParams();

    for (const profile of previewCommitteeProfiles) {
      for (const subcommittee of profile.subcommittees) {
        expect(params, subcommittee.systemCode).toContainEqual({
          chamber: profile.chamber,
          systemCode: subcommittee.systemCode,
        });
      }
    }
  });
});

describe("generateMetadata", (): void => {
  it("titles the page with the committee's name and describes what it is", async (): Promise<void> => {
    const metadata: Metadata = await generateMetadata({
      params: Promise.resolve({ chamber: firstCommittee.chamber, systemCode: firstCommittee.systemCode }),
    });

    expect(metadata.title).toBe(firstCommittee.name);
    expect(metadata.description).toBe(describeCommittee(firstCommittee));
    expect(metadata.alternates?.canonical).toBe(committeeHref(firstCommittee.chamber, firstCommittee.systemCode));
  });

  it("returns noindex not-found tags when the identifiers resolve to nothing", async (): Promise<void> => {
    const metadata: Metadata = await generateMetadata({
      params: Promise.resolve({ chamber: "house", systemCode: "preview-nothing" }),
    });

    expect(metadata.title).toBe("Committee Not Found");
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});

describe("CommitteePage", (): void => {
  it("renders the committee's record", async (): Promise<void> => {
    render(
      await CommitteePage({
        params: Promise.resolve({ chamber: firstCommittee.chamber, systemCode: firstCommittee.systemCode }),
      }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(firstCommittee.name);
  });

  it("renders every preview committee and subcommittee", async (): Promise<void> => {
    for (const profile of previewCommitteeProfiles) {
      const targets: { systemCode: string; name: string }[] = [
        { systemCode: profile.systemCode, name: profile.name },
        ...profile.subcommittees,
      ];

      for (const target of targets) {
        const { unmount } = render(
          await CommitteePage({
            params: Promise.resolve({ chamber: profile.chamber, systemCode: target.systemCode }),
          }),
        );

        expect(screen.getByRole("heading", { level: 1 }), target.systemCode).toHaveTextContent(target.name);
        unmount();
      }
    }
  });

  it("labels a preview record rather than presenting a fixture as the register", async (): Promise<void> => {
    render(
      await CommitteePage({
        params: Promise.resolve({ chamber: firstCommittee.chamber, systemCode: firstCommittee.systemCode }),
      }),
    );

    expect(screen.getByText("Preview Data")).toBeInTheDocument();
  });

  it("resolves both segments case-insensitively", async (): Promise<void> => {
    render(
      await CommitteePage({
        params: Promise.resolve({
          chamber: firstCommittee.chamber.toUpperCase(),
          systemCode: firstCommittee.systemCode.toUpperCase(),
        }),
      }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(firstCommittee.name);
  });

  it("opens on the first page of referred bills for a bare URL", async (): Promise<void> => {
    render(
      await CommitteePage({
        params: Promise.resolve({ chamber: firstCommittee.chamber, systemCode: firstCommittee.systemCode }),
      }),
    );

    expect(screen.getByRole("link", { name: /Bills Referred/ })).toHaveAttribute("aria-current", "page");
  });

  it("opens the collection its query param names", async (): Promise<void> => {
    // The whole point of the param: a committee page showing its reports is a place, so it has an address that brings
    // someone back to it.
    render(
      await CommitteePage({
        params: Promise.resolve({ chamber: firstCommittee.chamber, systemCode: firstCommittee.systemCode }),
        searchParams: Promise.resolve({ records: "reports" }),
      }),
    );

    expect(screen.getByRole("link", { name: /Reports Published/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(/PREVIEW Rept\. 119-4/)).toBeInTheDocument();
  });

  it("holds a page past the end of a collection inside it", async (): Promise<void> => {
    // A truncated or year-old shared link should land on a readable page rather than an empty one.
    render(
      await CommitteePage({
        params: Promise.resolve({ chamber: firstCommittee.chamber, systemCode: firstCommittee.systemCode }),
        searchParams: Promise.resolve({ records: "reports", page: "900" }),
      }),
    );

    expect(screen.getAllByText(/PREVIEW Rept\./).length).toBeGreaterThan(0);
  });

  it("degrades a stale collection param to the default view rather than failing", async (): Promise<void> => {
    render(
      await CommitteePage({
        params: Promise.resolve({ chamber: firstCommittee.chamber, systemCode: firstCommittee.systemCode }),
        searchParams: Promise.resolve({ records: "roll-calls" }),
      }),
    );

    expect(screen.getByRole("link", { name: /Bills Referred/ })).toHaveAttribute("aria-current", "page");
  });

  it("reads the nominations count when that is the collection asked for", async (): Promise<void> => {
    // The Senate placeholder is the only one with nominations, so this is also the case that proves the route reads a
    // different count per collection rather than always the bill one.
    const senate: CommitteeProfile = previewCommitteeProfiles.find(
      (profile: CommitteeProfile): boolean => profile.nominationCount !== undefined,
    ) as CommitteeProfile;

    render(
      await CommitteePage({
        params: Promise.resolve({ chamber: senate.chamber, systemCode: senate.systemCode }),
        searchParams: Promise.resolve({ records: "nominations" }),
      }),
    );

    expect(screen.getByText(/PREVIEW PN0001/)).toBeInTheDocument();
  });

  it("404s when a real code is paired with the wrong chamber", async (): Promise<void> => {
    const otherChamber: string = firstCommittee.chamber === "house" ? "senate" : "house";

    await expectNotFound((): Promise<unknown> => {
      return CommitteePage({
        params: Promise.resolve({ chamber: otherChamber, systemCode: firstCommittee.systemCode }),
      });
    });
  });

  it("404s for identifiers that resolve to nothing", async (): Promise<void> => {
    await expectNotFound((): Promise<unknown> => {
      return CommitteePage({ params: Promise.resolve({ chamber: "house", systemCode: "preview-nothing" }) });
    });
  });

  it("404s for a chamber segment naming no chamber at all", async (): Promise<void> => {
    for (const chamber of ["", "starfleet", "../secrets"]) {
      await expectNotFound((): Promise<unknown> => {
        return CommitteePage({ params: Promise.resolve({ chamber, systemCode: firstCommittee.systemCode }) });
      });
    }
  });
});
