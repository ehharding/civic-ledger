/**
 * Covers the `/bills` route for the current Congress.
 *
 * Exercised against the preview path rather than a mocked adapter: with no key configured, the real adapter returns
 * labeled fixtures, which means these tests run the route's actual data flow — snapshot, provenance notice, and the
 * `canLoadMore` gate that depends on it — instead of a rehearsal of it. The one thing that does get stubbed is the
 * adapter's failure mode, which no key-less run can produce on its own.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Congress switcher this route renders is a client component that navigates on change, so it needs a router. Only
// `useRouter` is replaced; `notFound` and everything else stay real, since other route tests depend on them behaving.
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
    }),
  };
});

import BillsPage, { metadata } from "@/app/bills/page";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { previewBills } from "@/lib/congress/fixtures";
import type { LegislativeBill } from "@/lib/congress/types";
import type { RouteSearchParams } from "@/lib/search-params";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

beforeEach((): void => {
  delete process.env.CONGRESS_API_KEY;
});

afterEach((): void => {
  if (originalApiKey === undefined) delete process.env.CONGRESS_API_KEY;
  else process.env.CONGRESS_API_KEY = originalApiKey;
  vi.restoreAllMocks();
});

/** Renders the route with the given deep link. */
async function renderPage(searchParams: RouteSearchParams = {}): Promise<void> {
  render(await BillsPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("BillsPage", (): void => {
  it("renders the directory under the route's own header copy", async (): Promise<void> => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Start With the Record.");
    expect(screen.getByText(/Search the current Congress's bills/)).toBeInTheDocument();
  });

  it("shows the current Congress's preview bills when no key is configured", async (): Promise<void> => {
    await renderPage();

    const currentBills: LegislativeBill[] = previewBills.filter(
      (bill: LegislativeBill): boolean => bill.congress === getCurrentCongress(),
    );
    expect(currentBills.length).toBeGreaterThan(0);
    for (const bill of currentBills) {
      expect(screen.getByText(bill.title), `${bill.type} ${bill.number}`).toBeInTheDocument();
    }
  });

  it("labels the data as preview rather than presenting fixtures as the record", async (): Promise<void> => {
    await renderPage();

    expect(
      screen.getByText(/Preview records are shown until a server-only Congress.gov API key is configured/),
    ).toBeInTheDocument();
  });

  it("offers the Congress switcher, preselecting the current Congress", async (): Promise<void> => {
    await renderPage();

    expect(screen.getByRole("combobox", { name: /Congress/i })).toHaveValue(String(getCurrentCongress()));
  });

  it("withholds Load More on preview data, since there is no further page to fetch", async (): Promise<void> => {
    await renderPage();

    expect(screen.queryByRole("button", { name: /Load More/i })).not.toBeInTheDocument();
  });

  it("arrives already narrowed to the view a shared ?q= link asked for", async (): Promise<void> => {
    await renderPage({ q: "water" });

    expect(screen.getByRole("searchbox", { name: "Search bill records" })).toHaveValue("water");
  });

  it("honors a ?stage= deep link on first paint", async (): Promise<void> => {
    await renderPage({ stage: "law" });

    // Rendered narrowed rather than showing everything and filtering after hydration.
    expect(screen.getByRole("button", { name: /Became Law/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("falls back to the unfiltered view for a stage param naming nothing", async (): Promise<void> => {
    await renderPage({ stage: "not-a-stage" });

    expect(screen.getByRole("button", { name: /All Stages/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("takes the first value of a repeated param rather than rejecting the whole URL", async (): Promise<void> => {
    await renderPage({ q: ["water", "broadband"] });

    expect(screen.getByRole("searchbox", { name: "Search bill records" })).toHaveValue("water");
  });

  it("names itself and its canonical path", (): void => {
    expect(metadata.title).toBe("Bills");
    expect(metadata.alternates?.canonical).toBe("/bills");
  });
});
