/**
 * Covers BillDetail's newer surface area: sponsor/cosponsor display, the CRS summary section (live vs. preview
 * captioning, the multi-summary note, the empty state), and the full-text links section (rendering vs. its two distinct
 * empty-state messages). BillJourney/latest-action rendering itself is already covered by bill-journey.test.tsx, so
 * this focuses on what's new here rather than re-covering that.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BillDetail } from "@/components/bills/bill-detail";
import type {
  BillAction,
  BillAmendment,
  BillCosponsor,
  BillSummary,
  BillTextVersion,
  LegislativeBill,
  RelatedBill,
} from "@/lib/congress/bills/model";
import type { BillSubResource } from "@/lib/congress/bills/sub-resource";
import type { BillCommittee } from "@/lib/congress/committees/model";
import { firstPreviewBill } from "@/lib/congress/upstream/fixtures";
import { readerText } from "@/test/reader-text";

const bill: LegislativeBill = firstPreviewBill;

/**
 * Wraps a collection as an *answered* request, which is what all but the unavailable-state cases below mean by an empty
 * list.
 *
 * Answered is the default here because it is the assertion nearly every test in this file is making: given these rows,
 * render this. The cases that mean the other thing say so explicitly with {@link unanswered}, and the difference
 * between the two is the whole point of the type — @see BillSubResource.
 */
function sub<Entry>(entries: Entry[]): BillSubResource<Entry> {
  return { entries, unavailable: false };
}

/** An empty collection whose request failed, for the cases that assert a section refuses to claim an absence. */
function unanswered<Entry>(): BillSubResource<Entry> {
  return { entries: [], unavailable: true };
}

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
      cosponsorTally: { current: 5 },
    };
    const { container } = render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={withSponsor}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("Sponsor: Rep. Test, Sample A. [D-ZZ-1]")).toBeInTheDocument();
    // Read through `readerText` because "Cosponsors" is a defined term and so carries its own hidden definition.
    // @see reader-text.ts — the count and its noun are what this pins, not the markup around them.
    expect(readerText(container.querySelector(".bill-detail-meta") as Element)).toContain("5 Cosponsors");
  });

  it("uses the singular form for exactly one cosponsor", (): void => {
    const withSponsor: LegislativeBill = { ...bill, cosponsorTally: { current: 1 } };
    const { container } = render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={withSponsor}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    const meta: string = readerText(container.querySelector(".bill-detail-meta") as Element);

    expect(meta).toContain("1 Cosponsor");
    expect(meta).not.toContain("1 Cosponsors");
  });

  it("omits sponsor and cosponsor lines when neither is present", (): void => {
    const withoutSponsor: LegislativeBill = { ...bill, sponsor: undefined, cosponsorTally: undefined };
    const { container } = render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={withoutSponsor}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.queryByText(/^Sponsor:/)).not.toBeInTheDocument();
    // Scoped to the hero's meta row rather than the whole document: the page now carries a "Cosponsors" section
    // heading unconditionally, since a bill with none says so in words. What this pins is that the meta row prints no
    // count when the record published none — which is a different claim from "the word never appears".
    expect(readerText(container.querySelector(".bill-detail-meta") as Element)).not.toContain("Cosponsor");
  });

  it("renders the live summary's sanitized HTML with CRS attribution", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([summaryB])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText(/Congressional Research Service summary — Reported to House/)).toBeInTheDocument();
    expect(screen.getByText("the current thing")).toBeInTheDocument();
  });

  it("labels a preview summary as illustrative rather than crediting CRS", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="preview"
        summaries={sub([summaryA])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("Illustrative preview summary — not a real CRS summary.")).toBeInTheDocument();
    expect(screen.queryByText(/Congressional Research Service summary —/)).not.toBeInTheDocument();
  });

  it("notes there are more summaries on file when a bill has more than one", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([summaryB, summaryA])}
        textVersions={sub([])}
      />,
    );

    // The preview fixture publishes no counts, so the page states its own tally rather than crediting Congress.gov.
    expect(screen.getByText(/This page shows 2 Congressional Research Service summaries/)).toBeInTheDocument();
    expect(screen.getByText(/The one above is the most recent/)).toBeInTheDocument();
  });

  it("credits Congress.gov with a collection's size when the record published one", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={{ ...bill, collectionCounts: { summaries: 2 } }}
        source="live"
        summaries={sub([summaryB, summaryA])}
        textVersions={sub([])}
      />,
    );

    expect(
      screen.getByText(/Congress\.gov records 2 Congressional Research Service summaries on this bill\./),
    ).toBeInTheDocument();
  });

  it("names both figures when fewer records are shown than the record publishes", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={{ ...bill, collectionCounts: { summaries: 5 } }}
        source="live"
        summaries={sub([summaryB, summaryA])}
        textVersions={sub([])}
      />,
    );

    // The gap is a fact about the record — a dropped row or a collection past this app's one-page fetch — so the page
    // states it rather than quietly presenting its own shorter list as the whole of what Congress.gov holds.
    expect(
      screen.getByText(
        /Congress\.gov records 5 Congressional Research Service summaries on this bill; this page shows 2\./,
      ),
    ).toBeInTheDocument();
  });

  it("offers earlier summaries in a collapsed disclosure, without hiding the newest one", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([summaryB, summaryA])}
        textVersions={sub([])}
      />,
    );

    // The most recent summary stays expanded; only the earlier ones are tucked behind the toggle.
    expect(screen.getByText("the current thing")).toBeInTheDocument();
    expect(screen.getByText("Read the 1 Earlier Summary")).toBeInTheDocument();
    expect(screen.getByText(/As introduced, this bill would do the earlier thing/)).toBeInTheDocument();
  });

  it("shows no disclosure when a bill has only one summary", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([summaryB])}
        textVersions={sub([])}
      />,
    );

    expect(screen.queryByText(/Earlier Summar/)).not.toBeInTheDocument();
  });

  it("links the sponsor to their member page when a Bioguide ID is on file", (): void => {
    const withBioguide: LegislativeBill = {
      ...bill,
      sponsor: { fullName: "Rep. Test, Sample A. [D-ZZ-1]", bioguideId: "T000001" },
    };
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={withBioguide}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    const link = screen.getByRole("link", { name: /Rep. Test, Sample A./ });
    // Inward, to this app's own page for the sponsor — which carries the official biography link onward. Staying in-app
    // is what makes a sponsor's other legislation reachable in one step rather than none.
    expect(link).toHaveAttribute("href", "/members/T000001");
    expect(link).not.toHaveAttribute("target");
  });

  it("shows the sponsor as plain text when no Bioguide ID is on file", (): void => {
    const withoutBioguide: LegislativeBill = { ...bill, sponsor: { fullName: "Rep. Test, Sample A. [D-ZZ-1]" } };
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={withoutBioguide}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.queryByRole("link", { name: /Rep. Test, Sample A./ })).not.toBeInTheDocument();
  });

  it("shows the date the bill was introduced", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("Introduced July 8, 2026")).toBeInTheDocument();
  });

  it("doesn't show the multi-summary note when there's only one summary", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([summaryB])}
        textVersions={sub([])}
      />,
    );

    expect(screen.queryByText(/most recent of/)).not.toBeInTheDocument();
  });

  it("shows a live-specific empty state when no summary has been published", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(
      screen.getByText("The Congressional Research Service hasn't published a summary for this bill yet."),
    ).toBeInTheDocument();
  });

  it("shows a preview-specific empty state for the summary section", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="preview"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("Summaries appear here once live Congress.gov data is connected.")).toBeInTheDocument();
  });

  it("lists each text version's formats as links to the official record", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([textVersion])}
      />,
    );

    const formattedTextLink = screen.getByRole("link", { name: /Formatted Text/ });
    expect(formattedTextLink).toHaveAttribute("href", textVersion.formats[0]?.url);
    expect(formattedTextLink).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: /PDF/ })).toBeInTheDocument();
  });

  it("shows a live-specific empty state when no text version has been published", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("Congress.gov hasn't published bill text for this record yet.")).toBeInTheDocument();
  });

  it("shows a preview-specific empty state for the full-text section", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="preview"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

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
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bare}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    // A sparse record is a normal record, not a broken one: the page renders without empty labels standing in for
    // fields Congress.gov has not published.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(bare.title);
    expect(screen.queryByText(/^Introduced \w+ \d/)).not.toBeInTheDocument();
    // Matched against a *date* rather than the bare word, which the "Recorded Votes" heading also starts with.
    expect(screen.queryByText(/^Recorded \w+ \d/)).not.toBeInTheDocument();
    expect(screen.queryByText(bill.policyArea as string)).not.toBeInTheDocument();
  });

  it("captions an undated summary without a trailing comma where the date would be", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([{ versionCode: "00", actionDesc: "Introduced in House", html: "<p>Body.</p>" }])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("Congressional Research Service summary — Introduced in House")).toBeInTheDocument();
  });

  it("lists an undated text version by type alone", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([
          { type: "Introduced in House", formats: [{ type: "PDF", url: "https://example.test/a.pdf" }] },
        ])}
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
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([
          { versionCode: "00", actionDesc: "Reported to House", html: "<p>Newest.</p>" },
          { versionCode: "00", actionDesc: "Introduced in House", html: "<p>Earlier.</p>" },
        ])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("Newest.")).toBeInTheDocument();
    expect(screen.getByText("Earlier.")).toBeInTheDocument();
  });

  it("keys multiple undated text versions by position rather than collapsing them", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([
          { type: "Introduced in House", formats: [{ type: "PDF", url: "https://example.test/a.pdf" }] },
          { type: "Reported in House", formats: [{ type: "PDF", url: "https://example.test/b.pdf" }] },
        ])}
      />,
    );

    expect(screen.getAllByRole("link", { name: /PDF/ })).toHaveLength(2);
  });
});

describe("BillDetail action history and recorded votes", (): void => {
  /** A House passage action carrying the roll call that recorded it. */
  const passage: BillAction = {
    date: "2025-01-23",
    text: "Passed/agreed to in House.",
    actionCode: "8000",
    type: "Floor",
    recordedVotes: [
      {
        chamber: "House",
        congress: 119,
        date: "2025-01-23T18:31:38Z",
        rollNumber: 190,
        sessionNumber: 1,
        url: "https://clerk.house.gov/evs/2025/roll190.xml",
      },
    ],
  };

  const referral: BillAction = {
    date: "2025-01-03",
    text: "Referred to the House Committee on Transportation and Infrastructure.",
    recordedVotes: [],
  };

  it("counts the actions and lists them all", (): void => {
    const { container } = render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([passage, referral])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText(/This page shows 2 actions for this bill/)).toBeInTheDocument();
    expect(screen.getByText("Read All 2 Actions")).toBeInTheDocument();
    // Read through `readerText`: action text runs through `GlossaryProse`, so a defined term inside it carries its own
    // hidden definition and splits the sentence across elements. @see reader-text.ts.
    const history: string = readerText(container.querySelector(".action-history__list") as Element);
    expect(history).toContain("Passed/agreed to in House.");
    expect(history).toContain("Referred to the House Committee on Transportation and Infrastructure.");
  });

  it("uses the singular for a bill with exactly one action", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([referral])}
        committees={sub([])}
        bill={{ ...bill, collectionCounts: { actions: 1 } }}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText(/records 1 action on this bill/)).toBeInTheDocument();
    expect(screen.getByText("Read All 1 Action")).toBeInTheDocument();
  });

  it("claims only the dedup for recorded votes, which carry no published count", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([passage, referral])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    // `collectRecordedVotes` collapses a roll call that two source systems each attached to their own action, so the
    // upstream record really does hold more references than this figure — which is why the sentence is about this
    // bill's actions rather than about what Congress.gov records.
    expect(screen.getByText(/actions reference 1 distinct recorded vote\./)).toBeInTheDocument();
    expect(screen.queryByText(/Congress\.gov records 1 recorded vote/)).not.toBeInTheDocument();
  });

  it("links a recorded vote to the chamber's own tally rather than printing a count", (): void => {
    const { container } = render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([passage, referral])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("House Roll Call 190 · January 23, 2025")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Office of the Clerk tally/ })).toHaveAttribute(
      "href",
      "https://clerk.house.gov/evs/2025/roll190.xml",
    );
    // The tallies themselves stay upstream: this app names the vote and links it, and prints no arithmetic.
    expect(readerText(container.querySelector(".recorded-vote-list") as Element)).not.toMatch(/\d+\s*[-–]\s*\d+/);
  });

  it("labels a Senate roll call as the Senate's own record", (): void => {
    const senate: BillAction = {
      date: "2025-06-30",
      text: "Passed Senate with an amendment by Yea-Nay Vote.",
      recordedVotes: [
        {
          chamber: "Senate",
          congress: 119,
          rollNumber: 329,
          sessionNumber: 1,
          url: "https://www.senate.gov/legislative/roll329.htm",
        },
      ],
    };
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([senate])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByRole("link", { name: /Senate tally/ })).toBeInTheDocument();
  });

  it("explains a bill with no recorded vote instead of leaving the section blank", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([referral])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    // A bill with no roll call is the ordinary case, not a gap in the data, and the copy has to say which.
    expect(screen.getByText(/No recorded vote appears in this bill/)).toBeInTheDocument();
  });

  it("declines to call a bill unvoted when the action history it would search never loaded", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={unanswered()}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    // This section is derived rather than fetched, so it inherits the action history's uncertainty: with nothing to
    // search, "no recorded vote appears in this bill's actions" describes an empty search, not a quiet bill.
    expect(screen.getByText(/cannot say whether any vote was taken on this bill/)).toBeInTheDocument();
    expect(screen.queryByText(/No recorded vote appears in this bill/)).not.toBeInTheDocument();
  });

  it("prints an undated roll call by number alone", (): void => {
    const undated: BillAction = {
      text: "Passed/agreed to in House.",
      recordedVotes: [
        { chamber: "House", congress: 119, rollNumber: 12, url: "https://clerk.house.gov/evs/2025/roll012.xml" },
      ],
    };
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([undated])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("House Roll Call 12")).toBeInTheDocument();
  });

  it("omits the dateline for an undated action rather than printing an empty one", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([{ text: "Introduced in House", recordedVotes: [] }])}
        bill={bill}
        committees={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("Introduced in House")).toBeInTheDocument();
    expect(document.querySelectorAll(".action-history__list .date-label")).toHaveLength(0);
  });

  it("says the history and votes are unavailable rather than absent when the fetch found nothing", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("No action history could be read for this bill.")).toBeInTheDocument();
    expect(document.querySelector(".summary-history")).not.toBeInTheDocument();
  });

  it("makes no claim about votes or actions in preview mode", (): void => {
    // Preview fixtures fabricate no action record, and a fabricated roll call is the single worst thing this app
    // could invent — so both sections say they are waiting on live data rather than reporting "none".
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="preview"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(
      screen.getByText("Recorded votes appear here once live Congress.gov data is connected."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/action history appears here once live Congress.gov data is connected/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No recorded vote appears/)).not.toBeInTheDocument();
  });

  it("prefers the action history over the latest action when deciding the stage", (): void => {
    // The real shape of HR 144 in the 119th: passed the House, then referred to a Senate committee. Reading only the
    // latest action walks the stepper backwards into "In Committee".
    const passedThenReferred: LegislativeBill = {
      ...bill,
      stage: "committee",
      latestAction: { date: "2025-01-24", text: "Received in the Senate and referred to the Committee on Finance." },
    };
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([passage])}
        committees={sub([])}
        bill={passedThenReferred}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(document.querySelector(".stage-label")).toHaveTextContent("Passed a Chamber");
  });

  it("keeps the bill's own stage when the action history establishes nothing", (): void => {
    const inCommittee: LegislativeBill = { ...bill, stage: "committee" };
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([referral])}
        committees={sub([])}
        bill={inCommittee}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(document.querySelector(".stage-label")).toHaveTextContent("In Committee");
  });

  it("prints the public law citation the record publishes, beside the stage it establishes", (): void => {
    const enacted: LegislativeBill = {
      ...bill,
      stage: "law",
      enactedLaw: { type: "Public Law", number: "119-21" },
    };
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={enacted}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(document.querySelector(".law-label")).toHaveTextContent("Public Law 119-21");
    expect(document.querySelector(".stage-label")).toHaveTextContent("Became Law");
  });

  it("prints no law chip for a bill the record names none for", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(document.querySelector(".law-label")).not.toBeInTheDocument();
  });

  it("never contradicts a published law with a less advanced action history", (): void => {
    // `passage` establishes "chamber". The record says the bill became law. One page cannot show both, and the record
    // is the one that isn't a reading. @see resolveBillStage.
    const enacted: LegislativeBill = { ...bill, stage: "law", enactedLaw: { type: "Public Law", number: "119-21" } };
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([passage])}
        committees={sub([])}
        bill={enacted}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(document.querySelector(".stage-label")).toHaveTextContent("Became Law");
  });
});

describe("BillDetail committees of referral", (): void => {
  const transportation: BillCommittee = {
    systemCode: "hspw00",
    name: "Transportation and Infrastructure Committee",
    chamber: "house",
    type: "standing",
    activities: [{ name: "Referred To" }, { name: "Reported By" }],
    subcommittees: [{ systemCode: "hspw05", name: "Aviation Subcommittee", activities: [{ name: "Referred to" }] }],
  };

  const agriculture: BillCommittee = {
    systemCode: "hsag00",
    name: "Agriculture Committee",
    chamber: "house",
    type: "standing",
    activities: [],
    subcommittees: [],
  };

  it("links each committee inward, to this app's own page for it", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        bill={bill}
        committees={sub([transportation, agriculture])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    // Inward rather than out to congress.gov, whose per-committee URL embeds a name slug the API never publishes.
    expect(screen.getByRole("link", { name: "Transportation and Infrastructure Committee" })).toHaveAttribute(
      "href",
      "/committees/house/hspw00",
    );
    // A subcommittee is reached under its parent's chamber, which is the only chamber either of them sits in.
    expect(screen.getByRole("link", { name: "Aviation Subcommittee" })).toHaveAttribute(
      "href",
      "/committees/house/hspw05",
    );
  });

  it("prints the relationship Congress.gov recorded, verbatim", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        bill={bill}
        committees={sub([transportation])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    // Not paraphrased into a status: a referral says where a bill went, not how it fared.
    expect(screen.getByText("Referred To · Reported By")).toBeInTheDocument();
  });

  it("omits the activity line entirely when the record named nothing printable", (): void => {
    const { container } = render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        bill={bill}
        committees={sub([agriculture])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(container.querySelectorAll(".bill-committee-list .date-label")).toHaveLength(0);
  });

  it("keeps the publisher's order rather than sorting the committees by name", (): void => {
    const { container } = render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        bill={bill}
        committees={sub([transportation, agriculture])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    const names: string[] = [...container.querySelectorAll(".bill-committee-list > li > a")].map(
      (link: Element): string => link.textContent ?? "",
    );

    // Primary jurisdiction first. Alphabetical would put Agriculture there and assert something false.
    expect(names).toEqual(["Transportation and Infrastructure Committee", "Agriculture Committee"]);
  });

  it("distinguishes a bill with no referral from a preview record that has none yet", (): void => {
    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );
    expect(screen.getByText(/No committee referral appears on this bill/)).toBeInTheDocument();

    render(
      <BillDetail
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        actions={sub([])}
        committees={sub([])}
        bill={bill}
        source="preview"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );
    expect(
      screen.getByText(/Committees of referral appear here once live Congress.gov data is connected/),
    ).toBeInTheDocument();
  });
});

/**
 * A cosponsor, overridable per test. Only the fields a given assertion reads are ever meaningful.
 */
function cosponsor(overrides: Partial<BillCosponsor> = {}): BillCosponsor {
  return {
    fullName: "Rep. Sample, Test [D-ZZ-1]",
    bioguideId: "S000001",
    party: "D",
    state: "ZZ",
    sponsorshipDate: "2025-03-04",
    isOriginal: false,
    ...overrides,
  };
}

describe("BillDetail cosponsors", (): void => {
  const original: BillCosponsor = cosponsor({
    bioguideId: "B000001",
    fullName: "Rep. Bergman, Jack [R-MI-1]",
    party: "R",
    isOriginal: true,
    sponsorshipDate: "2025-01-03",
  });
  const later: BillCosponsor = cosponsor({ bioguideId: "P000002", fullName: "Rep. Pappas, Chris [D-NH-1]" });

  it("links each cosponsor to their own member page, closing the one-way relationship", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([original, later])}
        related={sub([])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByRole("link", { name: "Rep. Bergman, Jack [R-MI-1]" })).toHaveAttribute(
      "href",
      "/members/B000001",
    );
  });

  it("marks the members who were on the bill at introduction, from the record's own flag", (): void => {
    const { container } = render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([original, later])}
        related={sub([])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    const badges: NodeListOf<Element> = container.querySelectorAll(".cosponsor-list__original");

    expect(badges).toHaveLength(1);
    expect(screen.getByText("At introduction")).toBeInTheDocument();
    expect(screen.getByText("Joined March 4, 2025")).toBeInTheDocument();
  });

  it("tints each row by party, reading the one-letter code the cosponsor record uses", (): void => {
    const { container } = render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([original, later])}
        related={sub([])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    const rows: Element[] = [...container.querySelectorAll(".cosponsor-list__item")];

    expect(rows[0]?.className).toContain("party-tint--republican");
    expect(rows[1]?.className).toContain("party-tint--democratic");
  });

  it("renders a cosponsor with no Bioguide ID as plain text rather than a link to nothing", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([cosponsor({ bioguideId: undefined, fullName: "Rep. Unlinkable, Sample [I-ZZ-1]" })])}
        related={sub([])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("Rep. Unlinkable, Sample [I-ZZ-1]")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Rep. Unlinkable, Sample [I-ZZ-1]" })).not.toBeInTheDocument();
  });

  it("marks the rare cosponsor who took their name off, with the date they did", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([cosponsor({ withdrawnDate: "2025-05-01" })])}
        related={sub([])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("Withdrawn May 1, 2025")).toBeInTheDocument();
  });

  it("omits the sponsorship date line when the record carries no date", (): void => {
    const { container } = render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([cosponsor({ sponsorshipDate: undefined })])}
        related={sub([])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(container.querySelectorAll(".cosponsor-list__meta .date-label")).toHaveLength(0);
  });

  it("caps the visible list and says how many are behind the disclosure", (): void => {
    const many: BillCosponsor[] = Array.from(
      { length: 15 },
      (_unused: unknown, index: number): BillCosponsor =>
        cosponsor({ bioguideId: `X${index}`, fullName: `Rep. Number${index}, Test [D-ZZ-1]` }),
    );
    const { container } = render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub(many)}
        related={sub([])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    const lists: NodeListOf<Element> = container.querySelectorAll(".cosponsor-list");

    // Twelve visible, three disclosed — and nothing dropped, which is what the label has to say.
    expect(lists[0]?.querySelectorAll("li")).toHaveLength(12);
    expect(lists[1]?.querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByText("Show the Remaining 3 Cosponsors")).toBeInTheDocument();
  });

  it("offers no disclosure when everything already fits", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([original, later])}
        related={sub([])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.queryByText(/Show the Remaining/)).not.toBeInTheDocument();
  });

  it("states that names are missing from the list when the published figures say some withdrew", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        bill={{ ...bill, cosponsorTally: { current: 2, includingWithdrawn: 4 } }}
        committees={sub([])}
        cosponsors={sub([original, later])}
        related={sub([])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText(/2 more members cosponsored this bill and later withdrew/)).toBeInTheDocument();
  });

  it("never credits Congress.gov with a count on a preview record", (): void => {
    // The trap this pins: a fixture bill *does* carry a cosponsor tally, because the hero's meta row needs a count to
    // show. Passing it through would print "Congress.gov records 12 cosponsors" over invented names.
    render(
      <BillDetail
        actions={sub([])}
        bill={{ ...bill, cosponsorTally: { current: 12, includingWithdrawn: 14 } }}
        committees={sub([])}
        cosponsors={sub([original, later])}
        related={sub([])}
        amendments={sub([])}
        source="preview"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.queryByText(/Congress\.gov records/)).not.toBeInTheDocument();
    expect(screen.getByText(/This page shows 2 cosponsors for this bill/)).toBeInTheDocument();
    // The withdrawal sentence is built from the same published pair, so it goes with them.
    expect(screen.queryByText(/later withdrew/)).not.toBeInTheDocument();
  });

  it("distinguishes a bill nobody cosponsored from a preview record that has none yet", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );
    expect(screen.getByText(/No member has cosponsored this bill/)).toBeInTheDocument();

    render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        source="preview"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );
    expect(screen.getByText(/Cosponsors appear here once live Congress.gov data is connected/)).toBeInTheDocument();
  });
});

describe("BillDetail amendments", (): void => {
  /** A fully described amendment — the roughly-one-in-fifteen case. */
  const described: BillAmendment = {
    congress: 119,
    type: "SAMDT",
    number: "2849",
    purpose: "To strike a provision relating to delayed implementation.",
    latestAction: { date: "2025-07-01", text: "Amendment SA 2849 not agreed to in Senate by Yea-Nay Vote." },
    officialUrl: "https://www.congress.gov/amendment/119th-congress/senate-amendment/2849",
  };

  /** The ordinary case: identity and nothing else. */
  const bare: BillAmendment = {
    congress: 119,
    type: "SAMDT",
    number: "2850",
    officialUrl: "https://www.congress.gov/amendment/119th-congress/senate-amendment/2850",
  };

  /** Builds `count` bare amendments, for the disclosure cap. */
  function manyAmendments(count: number): BillAmendment[] {
    return Array.from(
      { length: count },
      (_unused: unknown, index: number): BillAmendment => ({
        ...bare,
        number: String(3000 + index),
        officialUrl: `https://www.congress.gov/amendment/119th-congress/senate-amendment/${3000 + index}`,
      }),
    );
  }

  it("cites each amendment the way Congress's own records do, and links out to it", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        amendments={sub([described])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    // Outward rather than inward — the one collection on this page with no page of its own here to link to.
    // @see AmendmentRow.
    const link: HTMLElement = screen.getByRole("link", { name: /S\.Amdt\. 2849/ });

    expect(link).toHaveAttribute("href", "https://www.congress.gov/amendment/119th-congress/senate-amendment/2849");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("prints the purpose and the amendment's own latest action when the record carries them", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        amendments={sub([described])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("To strike a provision relating to delayed implementation.")).toBeInTheDocument();
    expect(
      screen.getByText((_content: string, element: Element | null): boolean =>
        element?.className === "amendment-list__action"
          ? readerText(element).includes("Amendment SA 2849 not agreed to in Senate")
          : false,
      ),
    ).toBeInTheDocument();
  });

  it("prints an undated latest action without a stray separator where the date would go", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        amendments={sub([{ ...described, latestAction: { text: "Amendment offered." } }])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    const action: Element = document.querySelector(".amendment-list__action") as Element;

    expect(readerText(action)).toBe("Amendment offered.");
    expect(action.querySelector(".date-label")).not.toBeInTheDocument();
  });

  it("renders a bare amendment as a citation alone rather than as an empty row", (): void => {
    // The ordinary shape of this collection. A placeholder standing in for prose Congress.gov never published would
    // present the record's own sparseness as a fault in this page. @see BillAmendment.
    render(
      <BillDetail
        actions={sub([])}
        amendments={sub([bare])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByRole("link", { name: /S\.Amdt\. 2850/ })).toBeInTheDocument();
    expect(document.querySelector(".amendment-list__purpose")).not.toBeInTheDocument();
    expect(document.querySelector(".amendment-list__action")).not.toBeInTheDocument();
  });

  it("counts how many carry a purpose, so the sparseness reads as the record's rather than this page's", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        amendments={sub([described, bare, bare])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(
      screen.getByText(/1 of them carry the purpose the record states; the rest are published here as citations only/),
    ).toBeInTheDocument();
  });

  it("says so plainly when none of them carry a purpose", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        amendments={sub([bare])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText(/Congress.gov publishes no purpose text for any of them here/)).toBeInTheDocument();
  });

  it("drops the qualifier entirely when every amendment carries a purpose", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        amendments={sub([described])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText(/Each carries the purpose the record states for it/)).toBeInTheDocument();
  });

  it("names both figures when the published count outruns the single page this app fetches", (): void => {
    // The ordinary case for this collection rather than the rare one: HR 1 of the 119th records 493 amendments and the
    // transport asks for 250. @see BillCollectionCounts.
    render(
      <BillDetail
        actions={sub([])}
        amendments={sub([described, bare])}
        bill={{ ...bill, collectionCounts: { amendments: 493 } }}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(
      screen.getByText(/Congress.gov records 493 amendments on this bill; this page shows 2\./),
    ).toBeInTheDocument();
  });

  it("caps the visible list and names how many are behind the disclosure", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        amendments={sub(manyAmendments(20))}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    // Nothing is dropped, and the label carries the number — the property that keeps a cap from reading as a complete
    // short list. @see DisclosedList.
    expect(screen.getByText("Show the Remaining 5 Amendments")).toBeInTheDocument();
    expect(document.querySelectorAll(".amendment-list > li")).toHaveLength(20);
  });

  it("says an absence is ordinary rather than leaving an empty panel", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        amendments={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText(/No amendment was offered to this bill/)).toBeInTheDocument();
  });

  it("waits for live data on a preview record rather than claiming Congress amended nothing", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        amendments={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([])}
        source="preview"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText(/Amendments appear here once live Congress.gov data is connected/)).toBeInTheDocument();
  });
});

describe("BillDetail related measures", (): void => {
  const companion: RelatedBill = {
    congress: 119,
    type: "S",
    number: "2875",
    title: "CHOICE Act",
    latestAction: { date: "2025-09-18", text: "Read twice and referred to the Committee on Finance." },
    relationships: [{ type: "Identical bill", identifiedBy: "CRS" }],
  };

  it("links each related measure to its own page here rather than out to Congress.gov", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([companion])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByRole("link", { name: "S 2875" })).toHaveAttribute("href", "/bills/119/s/2875");
    expect(screen.getByText("CHOICE Act")).toBeInTheDocument();
  });

  it("names the body that identified the relationship, since relatedness is a judgment", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([companion])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("Identical bill (CRS)")).toBeInTheDocument();
  });

  it("prints an unattributed relationship without inventing a source for it", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([{ ...companion, relationships: [{ type: "Procedurally-related" }] }])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText("Procedurally-related")).toBeInTheDocument();
  });

  it("omits the relationship line entirely when the record named none", (): void => {
    const { container } = render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([{ ...companion, relationships: [] }])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    // The identity line's Congress label is a .date-label too, so the count distinguishes "no relationship line" from
    // "no labels at all".
    expect(container.querySelectorAll(".related-bill-list .date-label")).toHaveLength(1);
  });

  it("omits the latest action when the related record carries none", (): void => {
    const { container } = render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([{ ...companion, latestAction: undefined }])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(container.querySelectorAll(".related-bill-list__action")).toHaveLength(0);
  });

  it("names the Congress a related measure sits in, which need not be this bill's", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([{ ...companion, congress: 118 }])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    expect(screen.getByText(/118th Congress/)).toBeInTheDocument();
  });

  it("caps the visible list and says how many are behind the disclosure", (): void => {
    const many: RelatedBill[] = Array.from(
      { length: 12 },
      (_unused: unknown, index: number): RelatedBill => ({ ...companion, number: String(index) }),
    );
    const { container } = render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub(many)}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );

    const lists: NodeListOf<Element> = container.querySelectorAll(".related-bill-list");

    expect(lists[0]?.querySelectorAll("li")).toHaveLength(9);
    expect(lists[1]?.querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByText("Show the Remaining 3 Related Measures")).toBeInTheDocument();
  });

  it("distinguishes a bill with no companion from a preview record that has none yet", (): void => {
    render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        source="live"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );
    expect(screen.getByText(/Congress.gov records no measure as related to this one/)).toBeInTheDocument();

    render(
      <BillDetail
        actions={sub([])}
        bill={bill}
        committees={sub([])}
        cosponsors={sub([])}
        related={sub([])}
        amendments={sub([])}
        source="preview"
        summaries={sub([])}
        textVersions={sub([])}
      />,
    );
    expect(
      screen.getByText(/Related measures appear here once live Congress.gov data is connected/),
    ).toBeInTheDocument();
  });

  it("makes no claim about the record in any section whose request went unanswered", (): void => {
    // The regression guard for this file's whole reason to carry `BillSubResource`. When the bill itself resolves from
    // the cached list snapshot but its seven sub-resource requests fail, the bill carries no `collectionCounts` to
    // check an empty list against — and every one of these sections would otherwise print a confident,
    // Congress.gov-attributed sentence about a record the app never read. `source` is "live" precisely because that is
    // the state that used to license those sentences.
    render(
      <BillDetail
        actions={unanswered()}
        bill={bill}
        committees={unanswered()}
        cosponsors={unanswered()}
        related={unanswered()}
        amendments={unanswered()}
        source="live"
        summaries={unanswered()}
        textVersions={unanswered()}
      />,
    );

    for (const claim of [
      /No committee referral appears/,
      /No member has cosponsored this bill/,
      /No action history could be read/,
      /hasn.t published a summary for this bill yet/,
      /Congress.gov hasn.t published bill text/,
      /Congress.gov records no measure as related to this one/,
      /No recorded vote appears/,
      /No amendment was offered to this bill/,
    ]) {
      expect(screen.queryByText(claim)).not.toBeInTheDocument();
    }

    // Eight sections, each saying what it cannot vouch for rather than saying nothing — an unexplained empty panel
    // reads as a bug in this app, which is the failure mode `EmptySectionNote` exists to prevent.
    expect(screen.getAllByText(/Congress.gov did not answer this request/)).toHaveLength(8);
  });
});
