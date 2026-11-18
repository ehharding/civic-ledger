/**
 * Covers SectionHeading's two forms: a plain row inside a section that its caller labels, and a section that labels
 * itself by its own heading.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionHeading } from "@/components/ui/section-heading";

describe("SectionHeading", (): void => {
  it("renders a plain row with its kicker and heading", (): void => {
    const { container } = render(<SectionHeading heading="Subcommittees" headingId="subs" kicker="One Level Down" />);

    const row: Element | null = container.firstElementChild;

    expect(row?.tagName).toBe("DIV");
    expect(row).toHaveClass("section-heading");
    expect(row).not.toHaveAttribute("aria-labelledby");
    expect(screen.getByRole("heading", { level: 2, name: "Subcommittees" })).toHaveAttribute("id", "subs");
    expect(screen.getByText("One Level Down")).toHaveClass("section-kicker");
  });

  it("labels itself by its own heading when it stands as a section", (): void => {
    render(
      <SectionHeading as="section" className="extra" heading="Latest" headingId="latest" kicker="Activity">
        <a href="/bills">Browse</a>
      </SectionHeading>,
    );

    const region: HTMLElement = screen.getByRole("region", { name: "Latest" });

    expect(region).toHaveClass("section-heading", "extra");
    expect(screen.getByRole("link", { name: "Browse" })).toBeInTheDocument();
  });
});
