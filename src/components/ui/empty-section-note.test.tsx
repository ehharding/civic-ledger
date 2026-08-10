/**
 * Covers the branch EmptySectionNote exists to hold in one place: a preview record says it is waiting for live data,
 * and a live record explains why an absence is ordinary. Getting these backwards would credit Congress.gov with the
 * emptiness of invented fixtures, which is the specific accident `docs/data-policy.md` forbids.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptySectionNote, previewPendingCopy } from "@/components/ui/empty-section-note";

describe("previewPendingCopy", (): void => {
  it("completes the sentence its caller opened, taking the verb from them", (): void => {
    expect(previewPendingCopy("Cosponsors appear")).toBe(
      "Cosponsors appear here once live Congress.gov data is connected.",
    );
    expect(previewPendingCopy("The action history appears")).toBe(
      "The action history appears here once live Congress.gov data is connected.",
    );
  });
});

describe("EmptySectionNote", (): void => {
  const absence = "No member has cosponsored this bill.";

  it("says a preview section is waiting for live data, making no claim about the record", (): void => {
    render(<EmptySectionNote absence={absence} previewLead="Cosponsors appear" source="preview" />);

    expect(screen.getByText("Cosponsors appear here once live Congress.gov data is connected.")).toBeInTheDocument();
    expect(screen.queryByText(absence)).not.toBeInTheDocument();
  });

  it("explains why a genuinely empty live section is empty", (): void => {
    render(<EmptySectionNote absence={absence} previewLead="Cosponsors appear" source="live" />);

    expect(screen.getByText(absence)).toBeInTheDocument();
    expect(screen.queryByText(/once live Congress\.gov data is connected/)).not.toBeInTheDocument();
  });

  it("reads as the same muted copy that introduces a populated section", (): void => {
    const { container } = render(<EmptySectionNote absence={absence} previewLead="Cosponsors appear" source="live" />);

    expect(container.querySelector("p")).toHaveClass("muted-copy");
  });
});
