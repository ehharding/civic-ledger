/**
 * Covers BillDirectory's server-backed search (`/api/bills/search`, debounced, with a client-side fallback when that
 * route can't be reached), the stage filter, the singular/plural result count, the empty states, and "Load More"
 * pagination — including its three stopping conditions (short page, empty page, request failure).
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BillDirectory } from "@/components/bill-directory";
import { firstPreviewBill, previewBills } from "@/lib/congress/fixtures";
import type { LegislativeBill } from "@/lib/congress/types";

function makeBill(overrides: Partial<LegislativeBill>): LegislativeBill {
  const base: LegislativeBill = firstPreviewBill;
  return { ...base, ...overrides };
}

/** A resolved /api/bills/search response for the given bills, with no truncation. */
function searchResponse(bills: LegislativeBill[]): { ok: true; json: () => Promise<unknown> } {
  return {
    ok: true,
    json: (): Promise<unknown> => Promise.resolve({ bills, congressesSearched: 27, truncated: false }),
  };
}

describe("BillDirectory", (): void => {
  let user: UserEvent;

  beforeEach((): void => {
    user = userEvent.setup();
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it("shows every bill and the plural record count by default", (): void => {
    render(<BillDirectory bills={previewBills} initialQuery="" canLoadMore={false} />);

    expect(screen.getByText(`Showing ${previewBills.length} Records`)).toBeInTheDocument();
    for (const bill of previewBills) {
      expect(screen.getByText(bill.title)).toBeInTheDocument();
    }
  });

  it("searches via /api/bills/search (debounced) and uses the singular label for exactly one match", async (): Promise<void> => {
    const fetchMock = vi.fn().mockResolvedValue(searchResponse([firstPreviewBill]));
    vi.stubGlobal("fetch", fetchMock);

    render(<BillDirectory bills={previewBills} initialQuery="" canLoadMore={false} />);
    await user.type(screen.getByLabelText("Search bill records"), firstPreviewBill.title);

    expect(await screen.findByText("1 Match")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/bills/search?q=${encodeURIComponent(firstPreviewBill.title)}`);
  });

  it("shows the search results and a scope note once the request resolves", async (): Promise<void> => {
    const bills: LegislativeBill[] = [
      makeBill({ congress: 119, type: "HR", number: "1", title: "Alpha Act", policyArea: "Energy" }),
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(searchResponse(bills)));

    render(<BillDirectory bills={previewBills} initialQuery="" canLoadMore={false} />);
    await user.type(screen.getByLabelText("Search bill records"), "alpha");

    expect(await screen.findByText("Alpha Act")).toBeInTheDocument();
    expect(screen.getByText(/Matched against titles, policy areas, and latest actions/)).toBeInTheDocument();
  });

  it("reverts to the plain browse listing once the query is cleared", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(searchResponse([firstPreviewBill])));

    render(<BillDirectory bills={previewBills} initialQuery="" canLoadMore={false} />);
    const search: HTMLElement = screen.getByLabelText("Search bill records");

    await user.type(search, firstPreviewBill.title);
    await screen.findByText("1 Match");

    await user.clear(search);
    expect(await screen.findByText(`Showing ${previewBills.length} Records`)).toBeInTheDocument();
  });

  it("falls back to filtering already-loaded bills when the search route can't be reached", async (): Promise<void> => {
    const bills: LegislativeBill[] = [
      makeBill({ congress: 119, type: "HR", number: "1", title: "Alpha Act", policyArea: "Energy" }),
      makeBill({ congress: 119, type: "S", number: "2", title: "Beta Act", policyArea: "Health" }),
    ];
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<BillDirectory bills={bills} initialQuery="" canLoadMore={false} />);
    await user.type(screen.getByLabelText("Search bill records"), "energy");

    expect(await screen.findByText("Alpha Act")).toBeInTheDocument();
    expect(screen.queryByText("Beta Act")).not.toBeInTheDocument();
    expect(screen.getByText(/Broader search isn't available right now/)).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(searchResponse([])));

    render(<BillDirectory bills={previewBills} initialQuery="" canLoadMore={false} />);
    await user.type(screen.getByLabelText("Search bill records"), "no such bill anywhere");

    expect(await screen.findByRole("heading", { name: "No Records Match That Search." })).toBeInTheDocument();
    expect(screen.getByText("0 Matches")).toBeInTheDocument();
  });

  it("shows a distinct empty state when there are no records to search at all", (): void => {
    render(<BillDirectory bills={[]} initialQuery="" canLoadMore={false} />);

    expect(screen.getByRole("heading", { name: "No Records Yet." })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No Records Match That Search." })).not.toBeInTheDocument();
  });

  it("filters by stage and marks the active button pressed", async (): Promise<void> => {
    render(<BillDirectory bills={previewBills} initialQuery="" canLoadMore={false} />);
    const introducedBill: LegislativeBill = previewBills.find(
      (b: LegislativeBill): boolean => b.stage === "introduced",
    ) as LegislativeBill;
    const otherBill: LegislativeBill = previewBills.find(
      (b: LegislativeBill): boolean => b.stage !== "introduced",
    ) as LegislativeBill;

    const stageButton: HTMLElement = screen.getByRole("button", { name: "Introduced" });
    expect(stageButton).toHaveAttribute("aria-pressed", "false");

    await user.click(stageButton);

    expect(stageButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(introducedBill.title)).toBeInTheDocument();
    expect(screen.queryByText(otherBill.title)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All Stages" }));
    expect(screen.getByText(otherBill.title)).toBeInTheDocument();
  });

  it("still filters search results by stage", async (): Promise<void> => {
    const bills: LegislativeBill[] = [
      makeBill({ congress: 119, type: "HR", number: "1", title: "Alpha Act", stage: "introduced" }),
      makeBill({ congress: 119, type: "HR", number: "2", title: "Alpha Amendment Act", stage: "law" }),
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(searchResponse(bills)));

    render(<BillDirectory bills={previewBills} initialQuery="" canLoadMore={false} />);
    await user.type(screen.getByLabelText("Search bill records"), "alpha");
    await screen.findByText("Alpha Act");

    await user.click(screen.getByRole("button", { name: "Introduced" }));

    expect(screen.getByText("Alpha Act")).toBeInTheDocument();
    expect(screen.queryByText("Alpha Amendment Act")).not.toBeInTheDocument();
  });

  it("does not render a load-more control when canLoadMore is false", (): void => {
    render(<BillDirectory bills={previewBills} initialQuery="" canLoadMore={false} />);
    expect(screen.queryByRole("button", { name: /Load More Bills/ })).not.toBeInTheDocument();
  });

  it("hides the load-more control while a search is active", async (): Promise<void> => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(searchResponse([firstPreviewBill])));

    render(<BillDirectory bills={previewBills} initialQuery="" canLoadMore={true} />);
    expect(screen.getByRole("button", { name: "Load More Bills" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search bill records"), firstPreviewBill.title);
    await screen.findByText("1 Match");

    expect(screen.queryByRole("button", { name: "Load More Bills" })).not.toBeInTheDocument();
  });

  it("appends a full page and keeps offering more", async (): Promise<void> => {
    const extraPage: LegislativeBill[] = Array.from(
      { length: 12 },
      (_: unknown, index: number): LegislativeBill =>
        makeBill({ congress: 119, type: "HR", number: `${900 + index}`, title: `Extra Bill ${index}` }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: (): Promise<unknown> => Promise.resolve({ bills: extraPage }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<BillDirectory bills={previewBills} initialQuery="" canLoadMore={true} />);
    await user.click(screen.getByRole("button", { name: "Load More Bills" }));

    expect(fetchMock).toHaveBeenCalledWith(`/api/bills?offset=${previewBills.length}`);
    expect(await screen.findByText("Extra Bill 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load More Bills" })).toBeInTheDocument();
  });

  it("scopes the load-more request to the given Congress when provided", async (): Promise<void> => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: (): Promise<unknown> => Promise.resolve({ bills: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<BillDirectory bills={previewBills} initialQuery="" canLoadMore={true} congress={118} />);
    await user.click(screen.getByRole("button", { name: "Load More Bills" }));

    expect(fetchMock).toHaveBeenCalledWith(`/api/bills?offset=${previewBills.length}&congress=118`);
  });

  it("stops offering more once a short page comes back", async (): Promise<void> => {
    const shortPage: LegislativeBill[] = [makeBill({ congress: 119, type: "HR", number: "999", title: "Last Bill" })];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: (): Promise<unknown> => Promise.resolve({ bills: shortPage }) }),
    );

    render(<BillDirectory bills={previewBills} initialQuery="" canLoadMore={true} />);
    await user.click(screen.getByRole("button", { name: "Load More Bills" }));

    expect(await screen.findByText("Last Bill")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load More Bills" })).not.toBeInTheDocument();
  });

  it("stops offering more once an empty page comes back", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: (): Promise<unknown> => Promise.resolve({ bills: [] }) }),
    );

    render(<BillDirectory bills={previewBills} initialQuery="" canLoadMore={true} />);
    await user.click(screen.getByRole("button", { name: "Load More Bills" }));

    await waitFor((): void => {
      expect(screen.queryByRole("button", { name: "Load More Bills" })).not.toBeInTheDocument();
    });
  });

  it("shows an alert and lets the user retry when the request fails", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: (): Promise<unknown> => Promise.resolve({}) }),
    );

    render(<BillDirectory bills={previewBills} initialQuery="" canLoadMore={true} />);
    await user.click(screen.getByRole("button", { name: "Load More Bills" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load more records. Try again.");
    expect(screen.getByRole("button", { name: "Load More Bills" })).toBeEnabled();
  });

  it("shows a loading state while the request is in flight", async (): Promise<void> => {
    let resolveFetch: (value: unknown) => void = (): void => {};
    const pending = new Promise((resolve: (value: unknown) => void): void => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));

    render(<BillDirectory bills={previewBills} initialQuery="" canLoadMore={true} />);
    await user.click(screen.getByRole("button", { name: /Load More Bills/ }));

    const button: HTMLElement = await screen.findByRole("button", { name: /Loading More/ });
    expect(within(button).getByText(/Loading More/)).toBeInTheDocument();
    expect(button).toBeDisabled();

    resolveFetch({ ok: true, json: (): Promise<unknown> => Promise.resolve({ bills: [] }) });
    await waitFor((): void => {
      expect(screen.queryByRole("button", { name: /Loading More/ })).not.toBeInTheDocument();
    });
  });
});
