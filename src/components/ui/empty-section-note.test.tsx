/**
 * Covers the branches EmptySectionNote exists to hold in one place: an unanswered request claims nothing, a preview
 * record says it is waiting for live data, and a live record explains why an absence is ordinary. Getting any of these
 * backwards states something false about the congressional record — crediting Congress.gov with the emptiness of
 * invented fixtures, or with an absence it was never asked about. Both are the accident `docs/data-policy.md` forbids.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptySectionNote, previewPendingCopy, unavailableCopy } from "@/components/ui/empty-section-note";

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

describe("unavailableCopy", (): void => {
  it("names the missing answer and then disclaims the fact it stands in for", (): void => {
    expect(unavailableCopy("Cosponsors are", "anyone signed on to this bill")).toBe(
      "Cosponsors are temporarily unavailable. Congress.gov did not answer this request, so this page cannot say whether anyone signed on to this bill.",
    );
  });

  it("takes the verb from the caller, since its subjects disagree about number", (): void => {
    expect(unavailableCopy("The action history is", "anything has happened to this bill")).toContain(
      "The action history is temporarily unavailable.",
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

  it("refuses the absence claim when the request went unanswered", (): void => {
    render(
      <EmptySectionNote
        absence={absence}
        previewLead="Cosponsors appear"
        source="live"
        unavailable
        unavailableLead="Cosponsors are"
        unavailableSubject="anyone signed on to this bill"
      />,
    );

    expect(screen.getByText(/Congress\.gov did not answer this request/)).toBeInTheDocument();
    expect(screen.queryByText(absence)).not.toBeInTheDocument();
  });

  it("puts the unanswered branch ahead of the preview one, which also makes a claim it cannot make", (): void => {
    render(
      <EmptySectionNote
        absence={absence}
        previewLead="Cosponsors appear"
        source="preview"
        unavailable
        unavailableLead="Cosponsors are"
        unavailableSubject="anyone signed on to this bill"
      />,
    );

    expect(screen.getByText(/Congress\.gov did not answer this request/)).toBeInTheDocument();
    expect(screen.queryByText(/once live Congress\.gov data is connected/)).not.toBeInTheDocument();
  });

  it("falls back to the ordinary copy when flagged unavailable without the strings to word it", (): void => {
    // The two strings are optional so the member page — whose lists have no third state — needn't carry them. A caller
    // that sets the flag and omits them gets the ordinary sentence rather than a half-built one.
    render(<EmptySectionNote absence={absence} previewLead="Cosponsors appear" source="live" unavailable />);

    expect(screen.getByText(absence)).toBeInTheDocument();
  });
});
