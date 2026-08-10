/**
 * Covers the invariant DetailPanel exists to hold: that a panel's `aria-labelledby` and its heading's `id` are the same
 * value, so a labeled region can never end up pointing at nothing. Also covers the element and class variants the four
 * record and lesson pages ask for.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DetailPanel } from "@/components/detail-panel";

describe("DetailPanel", (): void => {
  it("names the region by its own heading", (): void => {
    render(
      <DetailPanel headingId="votes-heading" kicker="Where Names Went on the Record" heading="Recorded Votes">
        <p>Body.</p>
      </DetailPanel>,
    );

    // Resolved through the accessibility tree rather than by reading the attribute back: this passes only if the id the
    // panel points at is actually on a heading, which is the pairing worth pinning.
    const panel: HTMLElement = screen.getByRole("region", { name: "Recorded Votes" });

    expect(panel.tagName).toBe("SECTION");
    expect(within(panel).getByRole("heading", { level: 2, name: "Recorded Votes" })).toBeInTheDocument();
    expect(within(panel).getByText("Where Names Went on the Record")).toBeInTheDocument();
    expect(within(panel).getByText("Body.")).toBeInTheDocument();
  });

  it("renders as a complementary aside when the panel supports the one beside it", (): void => {
    render(
      <DetailPanel accent as="aside" heading="Read the Full Text" headingId="fulltext-heading" kicker="Primary Source">
        <p>Body.</p>
      </DetailPanel>,
    );

    const panel: HTMLElement = screen.getByRole("complementary", { name: "Read the Full Text" });

    expect(panel).toHaveClass("detail-panel", "detail-panel--accent");
  });

  it("renders as an article for a self-contained lesson step, and keeps its own layout class", (): void => {
    render(
      <DetailPanel
        as="article"
        className="lesson-step"
        heading="In Committee"
        headingId="lesson-committee"
        kicker="Step 2 of 5"
      >
        <p>Body.</p>
      </DetailPanel>,
    );

    const panel: HTMLElement = screen.getByRole("article", { name: "In Committee" });

    expect(panel).toHaveClass("detail-panel", "lesson-step");
    expect(panel).not.toHaveClass("detail-panel--accent");
  });

  it("puts its children directly inside the panel, which the stylesheet's direct-child rules depend on", (): void => {
    render(
      <DetailPanel headingId="journey-heading" kicker="How This Moves" heading="The Bill’s Journey">
        <a className="text-link" href="/bills">
          All Bills
        </a>
      </DetailPanel>,
    );

    // `.detail-panel > .text-link` in bill-detail.css only applies if nothing wraps the children.
    const panel: HTMLElement = screen.getByRole("region", { name: "The Bill’s Journey" });
    expect(panel.querySelector(":scope > .text-link")).toBeInTheDocument();
  });
});
