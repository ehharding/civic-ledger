/**
 * Covers BillDetail's newer surface area: sponsor/cosponsor display, the CRS summary section (live vs. preview
 * captioning, the multi-summary note, the empty state), and the full-text links section (rendering vs. its two distinct
 * empty-state messages). BillJourney/latest-action rendering itself is already covered by bill-journey.test.tsx, so
 * this focuses on what's new here rather than re-covering that.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BillDetail } from "@/components/bill-detail";
import { firstPreviewBill } from "@/lib/congress/fixtures";
import type { BillSummary, BillTextVersion, LegislativeBill } from "@/lib/congress/types";

const bill: LegislativeBill = firstPreviewBill;

const summaryA: BillSummary = {
  versionCode: "00",
  actionDesc: "Introduced in House",
  actionDate: "2026-06-01",
  html: "<p>As introduced, this bill would do the earlier thing.</p>",
};

const summaryB: BillSummary = {
  versionCode: "36",
  actionDesc: "Reported to House",
  actionDate: "2026-07-01",
  html: "<p>As reported, this bill would do <strong>the current thing</strong>.</p>",
};

const textVersion: BillTextVersion = {
  type: "Introduced in House",
  date: "2026-06-01T04:00:00Z",
  formats: [
    { type: "Formatted Text", url: "https://www.congress.gov/119/bills/hr284/BILLS-ih.htm" },
    { type: "PDF", url: "https://www.congress.gov/119/bills/hr284/BILLS-ih.pdf" },
  ],
};

describe("BillDetail", (): void => {
  it("shows the sponsor and pluralized cosponsor count when present", (): void => {
    const withSponsor: LegislativeBill = {
      ...bill,
      sponsor: { fullName: "Rep. Test, Sample A. [D-ZZ-1]" },
      cosponsorCount: 5,
    };
    render(<BillDetail bill={withSponsor} source="live" summaries={[]} textVersions={[]} />);

    expect(screen.getByText("Sponsor: Rep. Test, Sample A. [D-ZZ-1]")).toBeInTheDocument();
    expect(screen.getByText("5 cosponsors")).toBeInTheDocument();
  });

  it("uses the singular form for exactly one cosponsor", (): void => {
    const withSponsor: LegislativeBill = { ...bill, cosponsorCount: 1 };
    render(<BillDetail bill={withSponsor} source="live" summaries={[]} textVersions={[]} />);

    expect(screen.getByText("1 cosponsor")).toBeInTheDocument();
  });

  it("omits sponsor and cosponsor lines when neither is present", (): void => {
    const withoutSponsor: LegislativeBill = { ...bill, sponsor: undefined, cosponsorCount: undefined };
    render(<BillDetail bill={withoutSponsor} source="live" summaries={[]} textVersions={[]} />);

    expect(screen.queryByText(/^Sponsor:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cosponsor/)).not.toBeInTheDocument();
  });

  it("renders the live summary's sanitized HTML with CRS attribution", (): void => {
    render(<BillDetail bill={bill} source="live" summaries={[summaryB]} textVersions={[]} />);

    expect(screen.getByText(/Congressional Research Service summary — Reported to House/)).toBeInTheDocument();
    expect(screen.getByText("the current thing")).toBeInTheDocument();
  });

  it("labels a preview summary as illustrative rather than crediting CRS", (): void => {
    render(<BillDetail bill={bill} source="preview" summaries={[summaryA]} textVersions={[]} />);

    expect(screen.getByText("Illustrative preview summary — not a real CRS summary.")).toBeInTheDocument();
    expect(screen.queryByText(/Congressional Research Service summary —/)).not.toBeInTheDocument();
  });

  it("notes there are more summaries on file when a bill has more than one", (): void => {
    render(<BillDetail bill={bill} source="live" summaries={[summaryB, summaryA]} textVersions={[]} />);

    expect(screen.getByText(/most recent of 2 summaries/)).toBeInTheDocument();
  });

  it("offers earlier summaries in a collapsed disclosure, without hiding the newest one", (): void => {
    render(<BillDetail bill={bill} source="live" summaries={[summaryB, summaryA]} textVersions={[]} />);

    // The most recent summary stays expanded; only the earlier ones are tucked behind the toggle.
    expect(screen.getByText("the current thing")).toBeInTheDocument();
    expect(screen.getByText("Read the 1 earlier summary")).toBeInTheDocument();
    expect(screen.getByText(/As introduced, this bill would do the earlier thing/)).toBeInTheDocument();
  });

  it("shows no disclosure when a bill has only one summary", (): void => {
    render(<BillDetail bill={bill} source="live" summaries={[summaryB]} textVersions={[]} />);

    expect(screen.queryByText(/earlier summar/)).not.toBeInTheDocument();
  });

  it("links the sponsor to their official biography when a Bioguide ID is on file", (): void => {
    const withBioguide: LegislativeBill = {
      ...bill,
      sponsor: { fullName: "Rep. Test, Sample A. [D-ZZ-1]", bioguideId: "T000001" },
    };
    render(<BillDetail bill={withBioguide} source="live" summaries={[]} textVersions={[]} />);

    const link = screen.getByRole("link", { name: /Rep. Test, Sample A./ });
    expect(link).toHaveAttribute("href", "https://bioguide.congress.gov/search/bio/T000001");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows the sponsor as plain text when no Bioguide ID is on file", (): void => {
    const withoutBioguide: LegislativeBill = { ...bill, sponsor: { fullName: "Rep. Test, Sample A. [D-ZZ-1]" } };
    render(<BillDetail bill={withoutBioguide} source="live" summaries={[]} textVersions={[]} />);

    expect(screen.queryByRole("link", { name: /Rep. Test, Sample A./ })).not.toBeInTheDocument();
  });

  it("shows the date the bill was introduced", (): void => {
    render(<BillDetail bill={bill} source="live" summaries={[]} textVersions={[]} />);

    expect(screen.getByText("Introduced July 8, 2026")).toBeInTheDocument();
  });

  it("doesn't show the multi-summary note when there's only one summary", (): void => {
    render(<BillDetail bill={bill} source="live" summaries={[summaryB]} textVersions={[]} />);

    expect(screen.queryByText(/most recent of/)).not.toBeInTheDocument();
  });

  it("shows a live-specific empty state when no summary has been published", (): void => {
    render(<BillDetail bill={bill} source="live" summaries={[]} textVersions={[]} />);

    expect(
      screen.getByText("The Congressional Research Service hasn't published a summary for this bill yet."),
    ).toBeInTheDocument();
  });

  it("shows a preview-specific empty state for the summary section", (): void => {
    render(<BillDetail bill={bill} source="preview" summaries={[]} textVersions={[]} />);

    expect(screen.getByText("Summaries appear here once live Congress.gov data is connected.")).toBeInTheDocument();
  });

  it("lists each text version's formats as links to the official record", (): void => {
    render(<BillDetail bill={bill} source="live" summaries={[]} textVersions={[textVersion]} />);

    const formattedTextLink = screen.getByRole("link", { name: /Formatted Text/ });
    expect(formattedTextLink).toHaveAttribute("href", textVersion.formats[0]?.url);
    expect(formattedTextLink).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: /PDF/ })).toBeInTheDocument();
  });

  it("shows a live-specific empty state when no text version has been published", (): void => {
    render(<BillDetail bill={bill} source="live" summaries={[]} textVersions={[]} />);

    expect(screen.getByText("Congress.gov hasn't published bill text for this record yet.")).toBeInTheDocument();
  });

  it("shows a preview-specific empty state for the full-text section", (): void => {
    render(<BillDetail bill={bill} source="preview" summaries={[]} textVersions={[]} />);

    expect(
      screen.getByText("Full-text links appear here once live Congress.gov data is connected."),
    ).toBeInTheDocument();
  });
});
