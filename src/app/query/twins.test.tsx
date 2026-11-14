/**
 * Covers the five `/query` twins together.
 *
 * Each twin is a few lines that hand the request's query to the renderer its static route shares, and every narrowed
 * behavior those renderers have is already tested beside the route that owns it. What is left to pin is the twin's own
 * contract, which is the same for all five and so reads best as one rule checked across the set:
 *
 * 1. **It passes the query through.** A twin that rendered the default view would look fine in every route test and
 *    serve every shared link unfiltered in production — the exact failure the twins exist to prevent.
 * 2. **It carries the same metadata as its route,** canonical path included. A narrowed link is a view of the plain
 *    route, not a second page, and its tags must say so rather than presenting `/query/...` to a crawler or a share
 *    card.
 * 3. **It streams the same loading skeleton,** so a narrowed link arrives looking like the page it resolves into.
 *
 * Lives inside `src/app/query` so the static demo build, which deletes that directory, takes these tests with it.
 * @see src/lib/query-routes.ts.
 */
import { render, screen } from "@testing-library/react";
import type { Metadata } from "next";
import { describe, expect, it, vi } from "vitest";

// The bill directories render the Congress switcher, a client component that navigates and so needs a router. Only
// `useRouter` is replaced, exactly as in the bill routes' own tests.
vi.mock("next/navigation", async (importOriginal): Promise<typeof import("next/navigation")> => {
  const actual: typeof import("next/navigation") = await importOriginal();
  const noop: () => void = (): void => {};
  return {
    ...actual,
    useRouter: (): ReturnType<typeof actual.useRouter> => ({
      push: noop,
      replace: noop,
      prefetch: noop,
      back: noop,
      forward: noop,
      refresh: noop,
      bfcacheId: "test-bfcache-id",
    }),
  };
});

import CongressBillsLoading from "@/app/bills/[congress]/loading";
import { generateMetadata as generateCongressBillsMetadata } from "@/app/bills/[congress]/page";
import BillsLoading from "@/app/bills/loading";
import { metadata as billsMetadata } from "@/app/bills/page";
import CommitteeLoading from "@/app/committees/[chamber]/[systemCode]/loading";
import { generateMetadata as generateCommitteeMetadata } from "@/app/committees/[chamber]/[systemCode]/page";
import CommitteesLoading from "@/app/committees/loading";
import { metadata as committeesMetadata } from "@/app/committees/page";
import MembersLoading from "@/app/members/loading";
import { metadata as membersMetadata } from "@/app/members/page";
import QueryCongressBillsLoading from "@/app/query/bills/[congress]/loading";
import QueryCongressBillsPage, {
  generateMetadata as generateQueryCongressBillsMetadata,
} from "@/app/query/bills/[congress]/page";
import QueryBillsLoading from "@/app/query/bills/loading";
import QueryBillsPage, { metadata as queryBillsMetadata } from "@/app/query/bills/page";
import QueryCommitteeLoading from "@/app/query/committees/[chamber]/[systemCode]/loading";
import QueryCommitteePage, {
  generateMetadata as generateQueryCommitteeMetadata,
} from "@/app/query/committees/[chamber]/[systemCode]/page";
import QueryCommitteesLoading from "@/app/query/committees/loading";
import QueryCommitteesPage, { metadata as queryCommitteesMetadata } from "@/app/query/committees/page";
import QueryMembersLoading from "@/app/query/members/loading";
import QueryMembersPage, { metadata as queryMembersMetadata } from "@/app/query/members/page";
import type { CommitteeProfile } from "@/lib/congress/committees/model";
import { previewCommitteeProfiles } from "@/lib/congress/upstream/fixtures";

const firstCommittee: CommitteeProfile = previewCommitteeProfiles[0] as CommitteeProfile;
const committeeParams: Promise<{ chamber: string; systemCode: string }> = Promise.resolve({
  chamber: firstCommittee.chamber,
  systemCode: firstCommittee.systemCode,
});

describe("each /query twin passes its query through", (): void => {
  it("/query/bills", async (): Promise<void> => {
    window.history.replaceState(null, "", "/bills?stage=law");
    render(await QueryBillsPage({ searchParams: Promise.resolve({ stage: "law" }) }));

    expect(screen.getByRole("button", { name: /Became Law/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("/query/bills/[congress]", async (): Promise<void> => {
    window.history.replaceState(null, "", "/bills/118?q=broadband");
    render(
      await QueryCongressBillsPage({
        params: Promise.resolve({ congress: "118" }),
        searchParams: Promise.resolve({ q: "broadband" }),
      }),
    );

    expect(screen.getByRole("searchbox", { name: "Search bill records" })).toHaveValue("broadband");
  });

  it("/query/members", async (): Promise<void> => {
    window.history.replaceState(null, "", "/members?q=alvarez");
    render(await QueryMembersPage({ searchParams: Promise.resolve({ q: "alvarez" }) }));

    expect(screen.getByRole("searchbox", { name: /Search members/ })).toHaveValue("alvarez");
  });

  it("/query/committees", async (): Promise<void> => {
    window.history.replaceState(null, "", "/committees?q=archives");
    render(await QueryCommitteesPage({ searchParams: Promise.resolve({ q: "archives" }) }));

    expect(screen.getByRole("searchbox", { name: /Search committees/ })).toHaveValue("archives");
  });

  it("/query/committees/[chamber]/[systemCode]", async (): Promise<void> => {
    render(
      await QueryCommitteePage({ params: committeeParams, searchParams: Promise.resolve({ records: "reports" }) }),
    );

    expect(screen.getByRole("link", { name: /Reports Published/ })).toHaveAttribute("aria-current", "page");
  });
});

describe("each /query twin carries its route's metadata", (): void => {
  it.each([
    { name: "/query/bills", twin: queryBillsMetadata, route: billsMetadata },
    { name: "/query/members", twin: queryMembersMetadata, route: membersMetadata },
    { name: "/query/committees", twin: queryCommitteesMetadata, route: committeesMetadata },
  ])("$name", ({ twin, route }: { twin: Metadata; route: Metadata }): void => {
    expect(twin).toBe(route);
  });

  it("/query/bills/[congress]", async (): Promise<void> => {
    const params: Promise<{ congress: string }> = Promise.resolve({ congress: "118" });

    expect(await generateQueryCongressBillsMetadata({ params, searchParams: Promise.resolve({}) })).toEqual(
      await generateCongressBillsMetadata({ params }),
    );
  });

  it("/query/committees/[chamber]/[systemCode]", async (): Promise<void> => {
    expect(
      await generateQueryCommitteeMetadata({ params: committeeParams, searchParams: Promise.resolve({}) }),
    ).toEqual(await generateCommitteeMetadata({ params: committeeParams }));
  });
});

describe("each /query twin streams its route's loading skeleton", (): void => {
  it.each([
    { name: "/query/bills", twin: QueryBillsLoading, route: BillsLoading },
    { name: "/query/bills/[congress]", twin: QueryCongressBillsLoading, route: CongressBillsLoading },
    { name: "/query/members", twin: QueryMembersLoading, route: MembersLoading },
    { name: "/query/committees", twin: QueryCommitteesLoading, route: CommitteesLoading },
    { name: "/query/committees/[chamber]/[systemCode]", twin: QueryCommitteeLoading, route: CommitteeLoading },
  ])("$name", ({ twin, route }: { twin: unknown; route: unknown }): void => {
    expect(twin).toBe(route);
  });
});
