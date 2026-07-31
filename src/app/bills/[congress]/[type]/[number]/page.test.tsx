/**
 * Covers the individual bill record route.
 *
 * Three reads go out here — the bill, its CRS summaries, and its official text versions — and the route's comment says
 * they go together because none depends on the others. That, plus the 404 for a bill that resolves to nothing and the
 * metadata's choice to describe a bill by its *latest action*, is what the tests pin. The latest-action description is
 * more load-bearing than it looks: it is the sentence someone following a shared link sees before they click, and it
 * has to survive a freshly-introduced record that carries no action text at all.
 */
import { render, screen } from "@testing-library/react";
import type { Metadata } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BillPage, { generateMetadata, generateStaticParams } from "@/app/bills/[congress]/[type]/[number]/page";
import { billHref } from "@/lib/bill-route";
import { firstPreviewBill, previewBills } from "@/lib/congress/fixtures";
import type { BillRouteParams, LegislativeBill } from "@/lib/congress/types";
import { expectNotFound } from "@/test/next-not-found";

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

/** The route params naming the first preview bill. */
function routeFor(bill: LegislativeBill): BillRouteParams {
  return { congress: String(bill.congress), type: bill.type.toLowerCase(), number: bill.number };
}

beforeEach((): void => {
  delete process.env.CONGRESS_API_KEY;
});

afterEach((): void => {
  vi.unstubAllGlobals();
  if (originalApiKey === undefined) delete process.env.CONGRESS_API_KEY;
  else process.env.CONGRESS_API_KEY = originalApiKey;
});

describe("generateStaticParams", (): void => {
  it("emits one entry per preview bill, with the type lower-cased as the path carries it", (): void => {
    expect(generateStaticParams()).toEqual(previewBills.map(routeFor));

    for (const params of generateStaticParams()) {
      expect(params.type, params.type).toBe(params.type.toLowerCase());
    }
  });
});

describe("generateMetadata", (): void => {
  it("titles the page with the bill's citation and its title", async (): Promise<void> => {
    const metadata: Metadata = await generateMetadata({ params: Promise.resolve(routeFor(firstPreviewBill)) });

    expect(metadata.title).toBe(`${firstPreviewBill.type} ${firstPreviewBill.number}: ${firstPreviewBill.title}`);
    expect(metadata.alternates?.canonical).toBe(billHref(firstPreviewBill));
  });

  it("describes the bill by its latest action, which says where the bill actually is", async (): Promise<void> => {
    const metadata: Metadata = await generateMetadata({ params: Promise.resolve(routeFor(firstPreviewBill)) });

    expect(metadata.description).toBe(firstPreviewBill.latestAction.text);
  });

  it("returns noindex not-found tags for a bill number naming nothing", async (): Promise<void> => {
    const metadata: Metadata = await generateMetadata({
      params: Promise.resolve({ congress: "119", type: "hr", number: "999999" }),
    });

    expect(metadata.title).toBe("Bill Not Found");
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});

describe("BillPage", (): void => {
  it("renders the bill record", async (): Promise<void> => {
    render(await BillPage({ params: Promise.resolve(routeFor(firstPreviewBill)) }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(firstPreviewBill.title);
    expect(screen.getByText(firstPreviewBill.latestAction.text as string)).toBeInTheDocument();
  });

  it("renders every preview bill, so no fixture links to a page that cannot resolve", async (): Promise<void> => {
    for (const bill of previewBills) {
      const { unmount } = render(await BillPage({ params: Promise.resolve(routeFor(bill)) }));

      expect(screen.getByRole("heading", { level: 1 }), `${bill.type} ${bill.number}`).toHaveTextContent(bill.title);
      unmount();
    }
  });

  it("labels the record as preview rather than presenting a fixture as the official one", async (): Promise<void> => {
    render(await BillPage({ params: Promise.resolve(routeFor(firstPreviewBill)) }));

    expect(screen.getByText("Preview Data")).toBeInTheDocument();
    expect(screen.queryByText("Live Congress.gov Data")).not.toBeInTheDocument();
  });

  it("404s for a bill number that resolves to no record", async (): Promise<void> => {
    await expectNotFound((): Promise<unknown> => {
      return BillPage({ params: Promise.resolve({ congress: "119", type: "hr", number: "999999" }) });
    });
  });

  it("404s for a malformed route rather than sending the segment upstream", async (): Promise<void> => {
    // Each of these fails `normalizeBillRouteParams` on a different rule: an unknown type code, a non-numeric
    // congress, and a bill number that isn't digits. None can reach Congress.gov.
    const malformed: BillRouteParams[] = [
      { congress: "119", type: "notatype", number: "284" },
      { congress: "abc", type: "hr", number: "284" },
      { congress: "119", type: "hr", number: "../secrets" },
    ];

    for (const params of malformed) {
      await expectNotFound((): Promise<unknown> => BillPage({ params: Promise.resolve(params) }));
    }
  });

  it("matches the fixture case-insensitively on the type segment", async (): Promise<void> => {
    render(
      await BillPage({
        params: Promise.resolve({ ...routeFor(firstPreviewBill), type: firstPreviewBill.type.toUpperCase() }),
      }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(firstPreviewBill.title);
  });
});
