/**
 * Covers HomePage's composition of hero/featured-journey/activity-grid, and the empty-bills edge case: with no bills,
 * there's no featured bill to show, and the component should render that gracefully rather than crash.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomePage } from "@/components/home-page";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { firstPreviewBill, previewBills } from "@/lib/congress/fixtures";
import type { CongressSnapshot } from "@/lib/congress/types";
import { formatOrdinal } from "@/lib/format";

describe("HomePage", (): void => {
  it("renders the hero and a featured journey for the first bill", (): void => {
    const snapshot: CongressSnapshot = { bills: previewBills, source: "preview", retrievedAt: "2026-07-14T00:00:00Z" };
    render(<HomePage snapshot={snapshot} />);

    expect(screen.getByRole("heading", { level: 1, name: "See Congress in Context." })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: `${firstPreviewBill.type} ${firstPreviewBill.number}` }),
    ).toBeInTheDocument();
  });

  it("labels the hero eyebrow with today's Congress, independent of what's in the snapshot's bills", (): void => {
    const expectedEyebrow = `${formatOrdinal(getCurrentCongress())} Congress · Legislative Guide`;

    const populated: CongressSnapshot = { bills: previewBills, source: "preview", retrievedAt: "2026-07-14T00:00:00Z" };
    const { unmount } = render(<HomePage snapshot={populated} />);
    expect(screen.getByText(expectedEyebrow)).toBeInTheDocument();
    unmount();

    const empty: CongressSnapshot = { bills: [], source: "preview", retrievedAt: "2026-07-14T00:00:00Z" };
    render(<HomePage snapshot={empty} />);
    expect(screen.getByText(expectedEyebrow)).toBeInTheDocument();
  });

  it("shows up to three bills in the activity grid", (): void => {
    const snapshot: CongressSnapshot = { bills: previewBills, source: "preview", retrievedAt: "2026-07-14T00:00:00Z" };
    render(<HomePage snapshot={snapshot} />);

    const activityGrid: HTMLElement = screen.getByRole("region", { name: "Recent bill activity" });
    for (const bill of previewBills.slice(0, 3)) {
      expect(within(activityGrid).getByText(bill.title)).toBeInTheDocument();
    }
  });

  it("renders without a featured journey when there are no bills", (): void => {
    const snapshot: CongressSnapshot = { bills: [], source: "preview", retrievedAt: "2026-07-14T00:00:00Z" };
    render(<HomePage snapshot={snapshot} />);

    expect(screen.getByRole("heading", { level: 1, name: "See Congress in Context." })).toBeInTheDocument();
    expect(screen.queryByText(/A bill in motion/)).not.toBeInTheDocument();
  });
});
