/**
 * Covers BillDetail's newer surface area: sponsor/cosponsor display, the CRS summary section (live vs. preview
 * captioning, the multi-summary note, the empty state), and the full-text links section (rendering vs. its two distinct
 * empty-state messages). BillJourney/latest-action rendering itself is already covered by bill-journey.test.tsx, so
 * this focuses on what's new here rather than re-covering that.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BillDetail } from "@/components/bill-detail";
import type { BillCommittee } from "@/lib/congress/committees";
import { firstPreviewBill } from "@/lib/congress/fixtures";
import type {
  BillAction,
  BillCosponsor,
  BillSummary,
  BillTextVersion,
  LegislativeBill,
  RelatedBill,
} from "@/lib/congress/types";
import { readerText } from "@/test/reader-text";

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
      cosponsorTally: { current: 5 },
    };
    const { container } = render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={withSponsor}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={withSponsor}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={withoutSponsor}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[summaryB]}
        textVersions={[]}
      />,
    );

    expect(screen.getByText(/Congressional Research Service summary — Reported to House/)).toBeInTheDocument();
    expect(screen.getByText("the current thing")).toBeInTheDocument();
  });

  it("labels a preview summary as illustrative rather than crediting CRS", (): void => {
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="preview"
        summaries={[summaryA]}
        textVersions={[]}
      />,
    );

    expect(screen.getByText("Illustrative preview summary — not a real CRS summary.")).toBeInTheDocument();
    expect(screen.queryByText(/Congressional Research Service summary —/)).not.toBeInTheDocument();
  });

  it("notes there are more summaries on file when a bill has more than one", (): void => {
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[summaryB, summaryA]}
        textVersions={[]}
      />,
    );

    // The preview fixture publishes no counts, so the page states its own tally rather than crediting Congress.gov.
    expect(screen.getByText(/This page shows 2 Congressional Research Service summaries/)).toBeInTheDocument();
    expect(screen.getByText(/The one above is the most recent/)).toBeInTheDocument();
  });

  it("credits Congress.gov with a collection's size when the record published one", (): void => {
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={{ ...bill, collectionCounts: { summaries: 2 } }}
        source="live"
        summaries={[summaryB, summaryA]}
        textVersions={[]}
      />,
    );

    expect(
      screen.getByText(/Congress\.gov records 2 Congressional Research Service summaries on this bill\./),
    ).toBeInTheDocument();
  });

  it("names both figures when fewer records are shown than the record publishes", (): void => {
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={{ ...bill, collectionCounts: { summaries: 5 } }}
        source="live"
        summaries={[summaryB, summaryA]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[summaryB, summaryA]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[summaryB]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={withBioguide}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={withoutBioguide}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(screen.queryByRole("link", { name: /Rep. Test, Sample A./ })).not.toBeInTheDocument();
  });

  it("shows the date the bill was introduced", (): void => {
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(screen.getByText("Introduced July 8, 2026")).toBeInTheDocument();
  });

  it("doesn't show the multi-summary note when there's only one summary", (): void => {
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[summaryB]}
        textVersions={[]}
      />,
    );

    expect(screen.queryByText(/most recent of/)).not.toBeInTheDocument();
  });

  it("shows a live-specific empty state when no summary has been published", (): void => {
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(
      screen.getByText("The Congressional Research Service hasn't published a summary for this bill yet."),
    ).toBeInTheDocument();
  });

  it("shows a preview-specific empty state for the summary section", (): void => {
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="preview"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(screen.getByText("Summaries appear here once live Congress.gov data is connected.")).toBeInTheDocument();
  });

  it("lists each text version's formats as links to the official record", (): void => {
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[]}
        textVersions={[textVersion]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(screen.getByText("Congress.gov hasn't published bill text for this record yet.")).toBeInTheDocument();
  });

  it("shows a preview-specific empty state for the full-text section", (): void => {
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="preview"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bare}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[passage, referral]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[referral]}
        committees={[]}
        bill={{ ...bill, collectionCounts: { actions: 1 } }}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(screen.getByText(/records 1 action on this bill/)).toBeInTheDocument();
    expect(screen.getByText("Read All 1 Action")).toBeInTheDocument();
  });

  it("claims only the dedup for recorded votes, which carry no published count", (): void => {
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[passage, referral]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[passage, referral]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[senate]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(screen.getByRole("link", { name: /Senate tally/ })).toBeInTheDocument();
  });

  it("explains a bill with no recorded vote instead of leaving the section blank", (): void => {
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[referral]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    // A bill with no roll call is the ordinary case, not a gap in the data, and the copy has to say which.
    expect(screen.getByText(/No recorded vote appears in this bill/)).toBeInTheDocument();
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
        cosponsors={[]}
        related={[]}
        actions={[undated]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(screen.getByText("House Roll Call 12")).toBeInTheDocument();
  });

  it("omits the dateline for an undated action rather than printing an empty one", (): void => {
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[{ text: "Introduced in House", recordedVotes: [] }]}
        bill={bill}
        committees={[]}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(screen.getByText("Introduced in House")).toBeInTheDocument();
    expect(document.querySelectorAll(".action-history__list .date-label")).toHaveLength(0);
  });

  it("says the history and votes are unavailable rather than absent when the fetch found nothing", (): void => {
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="preview"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[passage]}
        committees={[]}
        bill={passedThenReferred}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(document.querySelector(".stage-label")).toHaveTextContent("Passed a Chamber");
  });

  it("keeps the bill's own stage when the action history establishes nothing", (): void => {
    const inCommittee: LegislativeBill = { ...bill, stage: "committee" };
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[referral]}
        committees={[]}
        bill={inCommittee}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={enacted}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(document.querySelector(".law-label")).toHaveTextContent("Public Law 119-21");
    expect(document.querySelector(".stage-label")).toHaveTextContent("Became Law");
  });

  it("prints no law chip for a bill the record names none for", (): void => {
    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[passage]}
        committees={[]}
        bill={enacted}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        bill={bill}
        committees={[transportation, agriculture]}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        bill={bill}
        committees={[transportation]}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    // Not paraphrased into a status: a referral says where a bill went, not how it fared.
    expect(screen.getByText("Referred To · Reported By")).toBeInTheDocument();
  });

  it("omits the activity line entirely when the record named nothing printable", (): void => {
    const { container } = render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        bill={bill}
        committees={[agriculture]}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(container.querySelectorAll(".bill-committee-list .date-label")).toHaveLength(0);
  });

  it("keeps the publisher's order rather than sorting the committees by name", (): void => {
    const { container } = render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        bill={bill}
        committees={[transportation, agriculture]}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );
    expect(screen.getByText(/No committee referral appears on this bill/)).toBeInTheDocument();

    render(
      <BillDetail
        cosponsors={[]}
        related={[]}
        actions={[]}
        committees={[]}
        bill={bill}
        source="preview"
        summaries={[]}
        textVersions={[]}
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
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[original, later]}
        related={[]}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[original, later]}
        related={[]}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[original, later]}
        related={[]}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    const rows: Element[] = [...container.querySelectorAll(".cosponsor-list__item")];

    expect(rows[0]?.className).toContain("party-tint--republican");
    expect(rows[1]?.className).toContain("party-tint--democratic");
  });

  it("renders a cosponsor with no Bioguide ID as plain text rather than a link to nothing", (): void => {
    render(
      <BillDetail
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[cosponsor({ bioguideId: undefined, fullName: "Rep. Unlinkable, Sample [I-ZZ-1]" })]}
        related={[]}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(screen.getByText("Rep. Unlinkable, Sample [I-ZZ-1]")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Rep. Unlinkable, Sample [I-ZZ-1]" })).not.toBeInTheDocument();
  });

  it("marks the rare cosponsor who took their name off, with the date they did", (): void => {
    render(
      <BillDetail
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[cosponsor({ withdrawnDate: "2025-05-01" })]}
        related={[]}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(screen.getByText("Withdrawn May 1, 2025")).toBeInTheDocument();
  });

  it("omits the sponsorship date line when the record carries no date", (): void => {
    const { container } = render(
      <BillDetail
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[cosponsor({ sponsorshipDate: undefined })]}
        related={[]}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={many}
        related={[]}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[original, later]}
        related={[]}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(screen.queryByText(/Show the Remaining/)).not.toBeInTheDocument();
  });

  it("states that names are missing from the list when the published figures say some withdrew", (): void => {
    render(
      <BillDetail
        actions={[]}
        bill={{ ...bill, cosponsorTally: { current: 2, includingWithdrawn: 4 } }}
        committees={[]}
        cosponsors={[original, later]}
        related={[]}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(screen.getByText(/2 more members cosponsored this bill and later withdrew/)).toBeInTheDocument();
  });

  it("never credits Congress.gov with a count on a preview record", (): void => {
    // The trap this pins: a fixture bill *does* carry a cosponsor tally, because the hero's meta row needs a count to
    // show. Passing it through would print "Congress.gov records 12 cosponsors" over invented names.
    render(
      <BillDetail
        actions={[]}
        bill={{ ...bill, cosponsorTally: { current: 12, includingWithdrawn: 14 } }}
        committees={[]}
        cosponsors={[original, later]}
        related={[]}
        source="preview"
        summaries={[]}
        textVersions={[]}
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
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[]}
        related={[]}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );
    expect(screen.getByText(/No member has cosponsored this bill/)).toBeInTheDocument();

    render(
      <BillDetail
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[]}
        related={[]}
        source="preview"
        summaries={[]}
        textVersions={[]}
      />,
    );
    expect(screen.getByText(/Cosponsors appear here once live Congress.gov data is connected/)).toBeInTheDocument();
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
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[]}
        related={[companion]}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(screen.getByRole("link", { name: "S 2875" })).toHaveAttribute("href", "/bills/119/s/2875");
    expect(screen.getByText("CHOICE Act")).toBeInTheDocument();
  });

  it("names the body that identified the relationship, since relatedness is a judgment", (): void => {
    render(
      <BillDetail
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[]}
        related={[companion]}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(screen.getByText("Identical bill (CRS)")).toBeInTheDocument();
  });

  it("prints an unattributed relationship without inventing a source for it", (): void => {
    render(
      <BillDetail
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[]}
        related={[{ ...companion, relationships: [{ type: "Procedurally-related" }] }]}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(screen.getByText("Procedurally-related")).toBeInTheDocument();
  });

  it("omits the relationship line entirely when the record named none", (): void => {
    const { container } = render(
      <BillDetail
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[]}
        related={[{ ...companion, relationships: [] }]}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    // The identity line's Congress label is a .date-label too, so the count distinguishes "no relationship line" from
    // "no labels at all".
    expect(container.querySelectorAll(".related-bill-list .date-label")).toHaveLength(1);
  });

  it("omits the latest action when the related record carries none", (): void => {
    const { container } = render(
      <BillDetail
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[]}
        related={[{ ...companion, latestAction: undefined }]}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );

    expect(container.querySelectorAll(".related-bill-list__action")).toHaveLength(0);
  });

  it("names the Congress a related measure sits in, which need not be this bill's", (): void => {
    render(
      <BillDetail
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[]}
        related={[{ ...companion, congress: 118 }]}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[]}
        related={many}
        source="live"
        summaries={[]}
        textVersions={[]}
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
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[]}
        related={[]}
        source="live"
        summaries={[]}
        textVersions={[]}
      />,
    );
    expect(screen.getByText(/Congress.gov records no measure as related to this one/)).toBeInTheDocument();

    render(
      <BillDetail
        actions={[]}
        bill={bill}
        committees={[]}
        cosponsors={[]}
        related={[]}
        source="preview"
        summaries={[]}
        textVersions={[]}
      />,
    );
    expect(
      screen.getByText(/Related measures appear here once live Congress.gov data is connected/),
    ).toBeInTheDocument();
  });
});
