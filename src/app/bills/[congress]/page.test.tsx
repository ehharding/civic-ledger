/**
 * Covers the per-Congress bill directory: its prerendered param list, its metadata, and the route itself.
 *
 * The route's own comment makes one claim the tests are built around — that the current Congress resolves *here* too,
 * rather than redirecting to `/bills`, so no entry in the switcher is a special case. The other half is the guard: a
 * Congress outside the supported range is a 404, and the metadata for that URL has to agree rather than advertising a
 * page that isn't there.
 */
import { render, screen } from "@testing-library/react";
import type { Metadata } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The switcher this route renders navigates on change, so it needs a router; `notFound` must stay real, since the
// out-of-range cases below depend on it throwing exactly what Next throws.
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

import CongressBillsPage, { generateMetadata, generateStaticParams } from "@/app/bills/[congress]/page";
import { EARLIEST_COVERED_CONGRESS } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { previewBills } from "@/lib/congress/fixtures";
import type { LegislativeBill } from "@/lib/congress/types";
import type { RouteSearchParams } from "@/lib/search-params";
import { expectNotFound } from "@/test/next-not-found";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

beforeEach((): void => {
  delete process.env.CONGRESS_API_KEY;
});

afterEach((): void => {
  if (originalApiKey === undefined) delete process.env.CONGRESS_API_KEY;
  else process.env.CONGRESS_API_KEY = originalApiKey;
});

/** Renders the route for one Congress, with an optional deep link. */
async function renderPage(congress: string, searchParams: RouteSearchParams = {}): Promise<void> {
  render(
    await CongressBillsPage({
      params: Promise.resolve({ congress }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe("generateStaticParams", (): void => {
  it("emits one entry per Congress the preview fixtures cover, de-duplicated", (): void => {
    const expected: string[] = Array.from(
      new Set(previewBills.map((bill: LegislativeBill): string => String(bill.congress))),
    );

    expect(
      generateStaticParams()
        .map((param: { congress: string }): string => param.congress)
        .sort(),
    ).toEqual(expected.sort());
  });

  it("covers more than one Congress, which is what makes the switcher exercisable without a key", (): void => {
    expect(generateStaticParams().length).toBeGreaterThan(1);
  });
});

describe("generateMetadata", (): void => {
  it("names the Congress and the calendar years it sat, so a shared link says when as well as which", async (): Promise<void> => {
    const metadata: Metadata = await generateMetadata({
      params: Promise.resolve({ congress: "118" }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe("118th Congress Bills");
    expect(metadata.description).toMatch(/118th Congress \(\d{4}–\d{4}\)/);
    expect(metadata.alternates?.canonical).toBe("/bills/118");
  });

  it("returns noindex not-found tags for a Congress outside the supported range", async (): Promise<void> => {
    const metadata: Metadata = await generateMetadata({
      params: Promise.resolve({ congress: String(EARLIEST_COVERED_CONGRESS - 1) }),
      searchParams: Promise.resolve({}),
    });

    // The page itself 404s for this URL, and the tags have to agree rather than implying a page that isn't there.
    expect(metadata.title).toBe("Congress Not Found");
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("rejects a non-numeric segment in the metadata too, not just in the page", async (): Promise<void> => {
    const metadata: Metadata = await generateMetadata({
      params: Promise.resolve({ congress: "abc" }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe("Congress Not Found");
  });
});

describe("CongressBillsPage", (): void => {
  it("names the requested Congress in its heading", async (): Promise<void> => {
    await renderPage("118");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("The 118th Congress.");
  });

  it("shows only that Congress's preview bills, never borrowing from another", async (): Promise<void> => {
    await renderPage("118");

    for (const bill of previewBills) {
      const shown: boolean = screen.queryByText(bill.title) !== null;
      expect(shown, `${bill.congress} ${bill.type} ${bill.number}`).toBe(bill.congress === 118);
    }
  });

  it("serves the current Congress here too, rather than treating it as a special case", async (): Promise<void> => {
    const current: number = getCurrentCongress();
    await renderPage(String(current));

    // Worded "current" rather than repeating the ordinal, which is the one thing this route varies for it.
    expect(screen.getByText(/Search the current Congress's bills/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Congress/i })).toHaveValue(String(current));
  });

  it("names the ordinal instead for a concluded Congress", async (): Promise<void> => {
    await renderPage("118");

    expect(screen.getByText(/Search the 118th Congress's bills/)).toBeInTheDocument();
  });

  it("preselects the Congress being viewed in the switcher", async (): Promise<void> => {
    await renderPage("117");

    expect(screen.getByRole("combobox", { name: /Congress/i })).toHaveValue("117");
  });

  it("reports honestly when a supported Congress has no preview records at all", async (): Promise<void> => {
    await renderPage(String(EARLIEST_COVERED_CONGRESS));

    expect(screen.getByText(/No preview records are available for the/)).toBeInTheDocument();
  });

  it("arrives already narrowed to the view a shared link asked for", async (): Promise<void> => {
    await renderPage("118", { q: "broadband", stage: "law" });

    expect(screen.getByRole("searchbox", { name: "Search bill records" })).toHaveValue("broadband");
    expect(screen.getByRole("button", { name: /Became Law/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("404s for a Congress before the earliest one whose records exist", async (): Promise<void> => {
    await expectNotFound((): Promise<unknown> => {
      return CongressBillsPage({
        params: Promise.resolve({ congress: String(EARLIEST_COVERED_CONGRESS - 1) }),
        searchParams: Promise.resolve({}),
      });
    });
  });

  it("404s for a Congress that has not been seated yet", async (): Promise<void> => {
    await expectNotFound((): Promise<unknown> => {
      return CongressBillsPage({
        params: Promise.resolve({ congress: String(getCurrentCongress() + 1) }),
        searchParams: Promise.resolve({}),
      });
    });
  });

  it("404s for segments that are not clean whole numbers", async (): Promise<void> => {
    // `Number("-5")` is `-5` and `Number(" 119 ")` is `119`, so a coerce-first guard would quietly accept several
    // strings that are not the URL they claim to be.
    for (const raw of ["abc", "118.5", "-118", " 118 ", ""]) {
      await expectNotFound((): Promise<unknown> => {
        return CongressBillsPage({
          params: Promise.resolve({ congress: raw }),
          searchParams: Promise.resolve({}),
        });
      });
    }
  });
});
