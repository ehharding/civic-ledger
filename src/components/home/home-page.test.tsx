/**
 * Covers HomePage's composition of hero/featured-journey/activity-grid, and the empty-bills edge case: with no bills,
 * there's no featured bill to show, and the component should render that gracefully rather than crash.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomePage } from "@/components/home/home-page";
import type { CongressSnapshot, LegislativeBill } from "@/lib/congress/bills/model";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import type { CongressComposition } from "@/lib/congress/members/model";
import { buildPreviewComposition, firstPreviewBill, previewBills } from "@/lib/congress/upstream/fixtures";
import { formatOrdinal } from "@/lib/format";

const composition: CongressComposition = buildPreviewComposition(getCurrentCongress(), "2026-07-14T00:00:00Z");

describe("HomePage", (): void => {
  it("renders the hero and a featured journey for the first bill", (): void => {
    const snapshot: CongressSnapshot = { bills: previewBills, source: "preview", retrievedAt: "2026-07-14T00:00:00Z" };
    render(<HomePage composition={composition} snapshot={snapshot} />);

    expect(screen.getByRole("heading", { level: 1, name: "See Congress in Context." })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: `${firstPreviewBill.type} ${firstPreviewBill.number}` }),
    ).toBeInTheDocument();
  });

  it("labels the hero eyebrow with today's Congress, independent of what's in the snapshot's bills", (): void => {
    const expectedEyebrow = `${formatOrdinal(getCurrentCongress())} Congress · Legislative Guide`;

    const populated: CongressSnapshot = { bills: previewBills, source: "preview", retrievedAt: "2026-07-14T00:00:00Z" };
    const { unmount } = render(<HomePage composition={composition} snapshot={populated} />);
    expect(screen.getByText(expectedEyebrow)).toBeInTheDocument();
    unmount();

    const empty: CongressSnapshot = { bills: [], source: "preview", retrievedAt: "2026-07-14T00:00:00Z" };
    render(<HomePage composition={composition} snapshot={empty} />);
    expect(screen.getByText(expectedEyebrow)).toBeInTheDocument();
  });

  it("shows the three bills after the featured one in the activity grid, without repeating it", (): void => {
    const snapshot: CongressSnapshot = { bills: previewBills, source: "preview", retrievedAt: "2026-07-14T00:00:00Z" };
    render(<HomePage composition={composition} snapshot={snapshot} />);

    const activityGrid: HTMLElement = screen.getByRole("region", { name: "Recent bill activity" });
    for (const bill of previewBills.slice(1, 4)) {
      expect(within(activityGrid).getByText(bill.title)).toBeInTheDocument();
    }
    expect(within(activityGrid).queryByText(firstPreviewBill.title)).not.toBeInTheDocument();
  });

  /**
   * The preview fixtures already arrive in descending activity order, so every assertion above this one would pass
   * against a component that did no sorting at all — which is the whole reason this test hands it a snapshot in the
   * wrong order rather than reusing `previewBills`. Live data has no such courtesy: the list endpoint sorts on
   * `updateDate`, a maintenance timestamp, and routinely returns a bill last acted on in April above one acted on in
   * August.
   *
   * @see docs/architecture.md, "a list documented as 'most recent first' is sorted, not hoped for".
   */
  it("orders the featured bill and the grid by latest action, not by the order the snapshot arrived in", (): void => {
    const reversed: LegislativeBill[] = [...previewBills].reverse();
    const snapshot: CongressSnapshot = { bills: reversed, source: "preview", retrievedAt: "2026-07-14T00:00:00Z" };
    render(<HomePage composition={composition} snapshot={snapshot} />);

    // `reversed[0]` is the least recently acted-on fixture; the most recently acted-on one has to lead regardless.
    expect(
      screen.getByRole("heading", { name: `${firstPreviewBill.type} ${firstPreviewBill.number}` }),
    ).toBeInTheDocument();

    const activityGrid: HTMLElement = screen.getByRole("region", { name: "Recent bill activity" });
    for (const bill of previewBills.slice(1, 4)) {
      expect(within(activityGrid).getByText(bill.title)).toBeInTheDocument();
    }
  });

  it("renders without a featured journey when there are no bills", (): void => {
    const snapshot: CongressSnapshot = { bills: [], source: "preview", retrievedAt: "2026-07-14T00:00:00Z" };
    render(<HomePage composition={composition} snapshot={snapshot} />);

    expect(screen.getByRole("heading", { level: 1, name: "See Congress in Context." })).toBeInTheDocument();
    expect(screen.queryByText(/A Bill in Motion/i)).not.toBeInTheDocument();
  });

  it("renders the chamber seating chart for the current Congress", (): void => {
    const snapshot: CongressSnapshot = { bills: previewBills, source: "preview", retrievedAt: "2026-07-14T00:00:00Z" };
    render(<HomePage composition={composition} snapshot={snapshot} />);

    const seating: HTMLElement = screen.getByRole("region", { name: "Every Seat, and Who Holds It." });
    expect(within(seating).getByRole("tab", { name: /House/ })).toBeInTheDocument();
    expect(within(seating).getByRole("tab", { name: /Senate/ })).toBeInTheDocument();
  });

  it('links the featured bill\'s title and its "View This Bill" cue to its detail page', (): void => {
    const snapshot: CongressSnapshot = { bills: previewBills, source: "preview", retrievedAt: "2026-07-14T00:00:00Z" };
    render(<HomePage composition={composition} snapshot={snapshot} />);

    const expectedHref = `/bills/${firstPreviewBill.congress}/${firstPreviewBill.type.toLowerCase()}/${firstPreviewBill.number}`;
    const featuredCard: HTMLElement = screen.getByRole("complementary", {
      name: `${firstPreviewBill.type} ${firstPreviewBill.number}`,
    });

    expect(within(featuredCard).getByRole("link", { name: firstPreviewBill.title })).toHaveAttribute(
      "href",
      expectedHref,
    );
    expect(within(featuredCard).getByRole("link", { name: /View This Bill/ })).toHaveAttribute("href", expectedHref);
  });
});
