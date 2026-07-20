/**
 * Covers BillJourney's stepper logic: earlier stages marked complete, the current stage highlighted, later stages left
 * untouched, and the `compact` class toggle.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BillJourney } from "@/components/bill-journey";
import { billStageLabels, billStages } from "@/lib/congress/types";

describe("BillJourney", (): void => {
  it("marks stages before the current one complete and the current one current", (): void => {
    render(<BillJourney stage="chamber" compact={false} />);

    const items: HTMLElement[] = screen.getAllByRole("listitem");
    expect(items).toHaveLength(billStages.length);

    // introduced, committee: complete. chamber: current. president, law: neither.
    expect(items[0]).toHaveClass("is-complete");
    expect(items[1]).toHaveClass("is-complete");
    expect(items[2]).toHaveClass("is-current");
    expect(items[3]).not.toHaveClass("is-complete", "is-current");
    expect(items[4]).not.toHaveClass("is-complete", "is-current");
  });

  it("renders a checkmark only for completed stages", (): void => {
    render(<BillJourney stage="president" compact={false} />);

    const items: HTMLElement[] = screen.getAllByRole("listitem");
    // introduced, committee, chamber are complete and should each render a check icon (svg) instead of a number.
    for (const item of items.slice(0, 3)) {
      expect(item.querySelector("svg")).not.toBeNull();
    }
    // president (current) and law (upcoming) show their step number, not a check.
    expect(items[3]).toHaveTextContent("4");
    expect(items[4]).toHaveTextContent("5");
  });

  it("treats the first stage as having nothing complete yet", (): void => {
    render(<BillJourney stage="introduced" compact={false} />);

    const items: HTMLElement[] = screen.getAllByRole("listitem");
    expect(items[0]).toHaveClass("is-current");
    for (const item of items.slice(1)) {
      expect(item).not.toHaveClass("is-complete");
    }
  });

  it("labels every stage", (): void => {
    render(<BillJourney stage="law" compact={false} />);

    for (const stage of billStages) {
      expect(screen.getByText(billStageLabels[stage])).toBeInTheDocument();
    }
  });

  it("applies the compact modifier class only when requested", (): void => {
    const { container: compactContainer } = render(<BillJourney stage="introduced" compact={true} />);
    expect(compactContainer.querySelector("ol")).toHaveClass("bill-journey--compact");

    const { container: fullContainer } = render(<BillJourney stage="introduced" compact={false} />);
    expect(fullContainer.querySelector("ol")).not.toHaveClass("bill-journey--compact");
  });
});
