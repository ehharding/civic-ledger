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
    expect(screen.getByText("5 Cosponsors")).toBeInTheDocument();
  });

  it("uses the singular form for exactly one cosponsor", (): void => {
    const withSponsor: LegislativeBill = { ...bill, cosponsorCount: 1 };
    render(<BillDetail bill={withSponsor} source="live" summaries={[]} textVersions={[]} />);

    expect(screen.getByText("1 Cosponsor")).toBeInTheDocument();
  });

  it("omits sponsor and cosponsor lines when neither is present", (): void => {
    const withoutSponsor: LegislativeBill = { ...bill, sponsor: undefined, cosponsorCount: undefined };
    render(<BillDetail bill={withoutSponsor} source="live" summaries={[]} textVersions={[]} />);

    expect(screen.queryByText(/^Sponsor:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cosponsor/)).not.toBeInTheDocument();
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
    expect(screen.getByText("Read the 1 Earlier Summary")).toBeInTheDocument();
    expect(screen.getByText(/As introduced, this bill would do the earlier thing/)).toBeInTheDocument();
  });

  it("shows no disclosure when a bill has only one summary", (): void => {
    render(<BillDetail bill={bill} source="live" summaries={[summaryB]} textVersions={[]} />);

    expect(screen.queryByText(/Earlier Summar/)).not.toBeInTheDocument();
  });

  it("links the sponsor to their member page when a Bioguide ID is on file", (): void => {
    const withBioguide: LegislativeBill = {
      ...bill,
      sponsor: { fullName: "Rep. Test, Sample A. [D-ZZ-1]", bioguideId: "T000001" },
    };
    render(<BillDetail bill={withBioguide} source="live" summaries={[]} textVersions={[]} />);

    const link = screen.getByRole("link", { name: /Rep. Test, Sample A./ });
    // Inward, to this app's own page for the sponsor — which carries the official biography link onward. Staying in-app
    // is what makes a sponsor's other legislation reachable in one step rather than none.
    expect(link).toHaveAttribute("href", "/members/T000001");
    expect(link).not.toHaveAttribute("target");
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

describe("BillDetail with a sparse record", (): void => {
  /** The same bill with every optional field stripped — a freshly-introduced record that carries almost nothing. */
  const bare: LegislativeBill = {
    congress: bill.congress,
    type: bill.type,
    number: bill.number,
    title: bill.title,
    originChamber: bill.originChamber,
    latestAction: { text: "Introduced in House." },
    stage: "introduced",
    officialUrl: bill.officialUrl,
  };

  it("omits the policy area, introduced date, and action date when the record carries none", (): void => {
    render(<BillDetail bill={bare} source="live" summaries={[]} textVersions={[]} />);

    // A sparse record is a normal record, not a broken one: the page renders without empty labels standing in for
    // fields Congress.gov has not published.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(bare.title);
    expect(screen.queryByText(/^Introduced \w+ \d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Recorded /)).not.toBeInTheDocument();
    expect(screen.queryByText(bill.policyArea as string)).not.toBeInTheDocument();
  });

  it("captions an undated summary without a trailing comma where the date would be", (): void => {
    render(
      <BillDetail
        bill={bill}
        source="live"
        summaries={[{ versionCode: "00", actionDesc: "Introduced in House", html: "<p>Body.</p>" }]}
        textVersions={[]}
      />,
    );

    expect(screen.getByText("Congressional Research Service summary — Introduced in House")).toBeInTheDocument();
  });

  it("lists an undated text version by type alone", (): void => {
    render(
      <BillDetail
        bill={bill}
        source="live"
        summaries={[]}
        textVersions={[{ type: "Introduced in House", formats: [{ type: "PDF", url: "https://example.test/a.pdf" }] }]}
      />,
    );

    expect(screen.getByText("Introduced in House")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /PDF/ })).toHaveAttribute("href", "https://example.test/a.pdf");
  });

  it("keys earlier summaries by their action description when they share a version and carry no date", (): void => {
    // Two summaries with the same version code and no dates would collide on a date-only key, and React would drop one
    // of them silently.
    render(
      <BillDetail
        bill={bill}
        source="live"
        summaries={[
          { versionCode: "00", actionDesc: "Reported to House", html: "<p>Newest.</p>" },
          { versionCode: "00", actionDesc: "Introduced in House", html: "<p>Earlier.</p>" },
        ]}
        textVersions={[]}
      />,
    );

    expect(screen.getByText("Newest.")).toBeInTheDocument();
    expect(screen.getByText("Earlier.")).toBeInTheDocument();
  });

  it("keys multiple undated text versions by position rather than collapsing them", (): void => {
    render(
      <BillDetail
        bill={bill}
        source="live"
        summaries={[]}
        textVersions={[
          { type: "Introduced in House", formats: [{ type: "PDF", url: "https://example.test/a.pdf" }] },
          { type: "Reported in House", formats: [{ type: "PDF", url: "https://example.test/b.pdf" }] },
        ]}
      />,
    );

    expect(screen.getAllByRole("link", { name: /PDF/ })).toHaveLength(2);
  });
});
