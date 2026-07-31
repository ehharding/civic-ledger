/**
 * Covers all seven `loading.tsx` routes together.
 *
 * One file rather than seven, because the assertion worth making is a *shared* one and only reads as a rule when every
 * route is checked against it in the same place: a skeleton is a wall of contentless boxes, so every placeholder must
 * be hidden from assistive technology and each route must say "loading" exactly once, out loud, instead. Seven
 * near-identical files would each restate that and none of them would enforce it across the set.
 *
 * The per-route copy is checked too, since matching the real page's wording is the entire reason these exist — a
 * skeleton whose heading differs from the page it resolves into is a visible jump rather than a smooth arrival.
 */
import { render, screen, within } from "@testing-library/react";
import type { JSX } from "react";
import { describe, expect, it } from "vitest";

import BillDetailLoading from "@/app/bills/[congress]/[type]/[number]/loading";
import CongressBillsLoading from "@/app/bills/[congress]/loading";
import BillsLoading from "@/app/bills/loading";
import CommitteeLoading from "@/app/committees/[chamber]/[systemCode]/loading";
import CommitteesLoading from "@/app/committees/loading";
import MemberLoading from "@/app/members/[bioguideId]/loading";
import MembersLoading from "@/app/members/loading";

/** Every loading route, with the one sentence it is expected to announce. */
const LOADING_ROUTES: readonly { name: string; Component: () => JSX.Element; status: string }[] = [
  { name: "/bills", Component: BillsLoading, status: "Loading Bills…" },
  { name: "/bills/[congress]", Component: CongressBillsLoading, status: "Loading Bills…" },
  { name: "/bills/[congress]/[type]/[number]", Component: BillDetailLoading, status: "Loading Bill Record…" },
  { name: "/members", Component: MembersLoading, status: "Loading Members…" },
  { name: "/members/[bioguideId]", Component: MemberLoading, status: "Loading Member…" },
  { name: "/committees", Component: CommitteesLoading, status: "Loading Committees…" },
  { name: "/committees/[chamber]/[systemCode]", Component: CommitteeLoading, status: "Loading Committee…" },
];

describe("loading routes", (): void => {
  it.each(LOADING_ROUTES)("$name announces exactly one status message", ({ Component, status }): void => {
    render(<Component />);

    const statuses: HTMLElement[] = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent(status);
    // `role="status"` is implicitly polite: a page that is merely still loading is not worth interrupting whatever is
    // currently being read.
    expect(statuses[0]).toHaveClass("sr-only");
  });

  it.each(LOADING_ROUTES)("$name hides every placeholder block from assistive technology", ({ Component }): void => {
    const { container } = render(<Component />);

    const blocks: NodeListOf<Element> = container.querySelectorAll(".skeleton");
    expect(blocks.length).toBeGreaterThan(0);

    for (const block of blocks) {
      // Hidden either directly or by an `aria-hidden` ancestor — the primitives hide the wrapper, not each block.
      expect(block.closest("[aria-hidden='true']"), block.className).not.toBeNull();
    }
  });

  it.each(LOADING_ROUTES.filter(({ Component }): boolean => Component !== BillsLoading))(
    "$name renders no heading of its own beyond the copy it is allowed to know",
    ({ Component, name }): void => {
      render(<Component />);

      // The three record routes and the two non-bill directories can't know their page's title before the data lands,
      // so they draw a blank block rather than a heading — a placeholder heading would be announced and then replaced,
      // which is worse than one arriving once. `/bills/[congress]` is the one exception below.
      const heading: HTMLElement | null = within(screen.getByRole("main")).queryByRole("heading");
      if (Component === CongressBillsLoading) {
        expect(heading, name).toHaveTextContent("Loading This Congress…");
        return;
      }
      expect(heading, name).toBeNull();
    },
  );

  it("lets /bills state its real heading, because that route's copy is fixed and known ahead of the data", (): void => {
    render(<BillsLoading />);

    expect(within(screen.getByRole("main")).getByRole("heading")).toHaveTextContent("Start With the Record.");
  });

  it.each(LOADING_ROUTES)(
    "$name keeps the site chrome, so navigation stays usable while loading",
    ({ Component }): void => {
      render(<Component />);

      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    },
  );
});

describe("bill directory skeletons", (): void => {
  it("matches /bills' own header copy exactly, so nothing shifts when content arrives", (): void => {
    render(<BillsLoading />);

    expect(screen.getByText("Start With the Record.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Search the current Congress's bills, then follow each record back to its official Congress.gov source.",
      ),
    ).toBeInTheDocument();
  });

  it("stays generic on /bills/[congress], which cannot know which Congress was asked for", (): void => {
    render(<CongressBillsLoading />);

    // Next's loading UI receives no route params, and a placeholder that guessed at the number would flicker to a
    // different one when the real page arrived.
    expect(screen.getByText("Loading This Congress…")).toBeInTheDocument();
    expect(screen.queryByText(/\d+(st|nd|rd|th) Congress/)).not.toBeInTheDocument();
  });
});

describe("skeleton grid sizes", (): void => {
  it("draws a full first page of member cards, so the roster does not visibly grow", (): void => {
    const { container } = render(<MembersLoading />);

    expect(container.querySelectorAll(".skeleton--member-card")).toHaveLength(9);
    expect(container.querySelectorAll(".skeleton--facet")).toHaveLength(3);
  });

  it("draws one facet placeholder per real control on the committee directory", (): void => {
    const { container } = render(<CommitteesLoading />);

    // Committee type and sort — two, where the member directory's row has three.
    expect(container.querySelectorAll(".skeleton--facet")).toHaveLength(2);
    expect(container.querySelectorAll(".skeleton--member-card")).toHaveLength(9);
  });

  it("caps the member page's card grid at the number of bills that page actually shows", (): void => {
    const { container } = render(<MemberLoading />);

    expect(container.querySelectorAll(".skeleton--card")).toHaveLength(3);
  });

  it("draws the committee record's two panels rather than a repeating grid", (): void => {
    const { container } = render(<CommitteeLoading />);

    // Two panels of different heights, not a row of identical cards — drawing them as a grid would settle into a
    // layout the real page never takes.
    expect(container.querySelectorAll(".skeleton--panel")).toHaveLength(2);
  });
});
