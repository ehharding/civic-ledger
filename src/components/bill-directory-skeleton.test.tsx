/**
 * Covers the loading skeleton both bill-directory routes stream while their snapshot fetch resolves.
 *
 * The two properties worth pinning are the ones a skeleton exists for: it takes the header copy of whichever route
 * rendered it, so nothing shifts when content arrives, and it says "loading" once out loud rather than presenting a
 * grid of empty boxes to a screen reader.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BillDirectorySkeleton } from "@/components/bill-directory-skeleton";

/** The props both routes pass, standing in for the per-Congress route's wording. */
const props = {
  eyebrow: "Legislation",
  title: "The 118th Congress.",
  description: "Search the 118th Congress's bills.",
} as const;

describe("BillDirectorySkeleton", (): void => {
  it("renders the calling route's own header copy, so the heading doesn't change when content arrives", (): void => {
    render(<BillDirectorySkeleton {...props} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("The 118th Congress.");
    expect(screen.getByText("Search the 118th Congress's bills.")).toBeInTheDocument();
  });

  it("sits inside the site chrome, so the header and footer don't flash in after the skeleton", (): void => {
    render(<BillDirectorySkeleton {...props} />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("announces that it is loading exactly once", (): void => {
    render(<BillDirectorySkeleton {...props} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading Bills…");
  });

  it("hides every placeholder block from assistive technology", (): void => {
    const { container } = render(<BillDirectorySkeleton {...props} />);

    for (const placeholder of container.querySelectorAll(".skeleton-controls, .directory-grid")) {
      expect(placeholder).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("draws a full first page of card placeholders, so the grid doesn't grow when the real cards land", (): void => {
    const { container } = render(<BillDirectorySkeleton {...props} />);

    expect(container.querySelectorAll(".skeleton--card")).toHaveLength(6);
  });
});
