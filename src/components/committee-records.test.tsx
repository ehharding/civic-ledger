/**
 * Covers the committee records section: the three collection tabs, the three row shapes, the pager, and the empty
 * states.
 *
 * Three of these assertions are about what the section refuses to do, and those are the load-bearing ones:
 *
 * - **An unavailable collection is never reported as an empty one.** Zero rows can mean "this committee has published
 *   no reports" or "Congress.gov did not answer", and printing the first over the second state tells a reader something
 *   false about the congressional record.
 * - **A report is never given an outbound link.** Congress.gov's report URLs look derivable from what the record
 *   carries, and this project cannot verify that they are — congress.gov answers every automated check with a bot
 *   challenge. An authoritative-looking link that 404s is worse than a citation a reader can search.
 * - **Every control navigates.** The tabs and the pager's four steps are real links, and the pager's page field is a
 *   real GET form, so each view is shareable, openable in a new tab, and reachable without JavaScript. A click handler
 *   over local state would pass a "does it switch tabs" test and fail every one of those.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CommitteeRecordsSection } from "@/components/committee-records";
import type {
  CommitteeBillReferral,
  CommitteeNomination,
  CommitteeRecords,
  CommitteeRecordsResult,
  CommitteeReport,
} from "@/lib/congress/committee-records";
import type { CommitteeProfile } from "@/lib/congress/committees";

function profile(overrides: Partial<CommitteeProfile> = {}): CommitteeProfile {
  return {
    systemCode: "hsag00",
    name: "Agriculture Committee",
    chamber: "house",
    type: "standing",
    subcommitteeCount: 0,
    isCurrent: true,
    history: [],
    subcommittees: [],
    billCount: 10_205,
    reportCount: 142,
    ...overrides,
  };
}

function result(records: CommitteeRecords, overrides: Partial<CommitteeRecordsResult> = {}): CommitteeRecordsResult {
  return {
    records,
    page: 1,
    pageCount: 1,
    total: records.items.length,
    unavailable: false,
    ...overrides,
  };
}

function referral(overrides: Partial<CommitteeBillReferral> = {}): CommitteeBillReferral {
  return {
    congress: 119,
    type: "HR",
    number: "10000",
    relationship: "Referred To",
    actionDate: "2026-07-30T12:31:05Z",
    bill: {
      congress: 119,
      type: "HR",
      number: "10000",
      title: "Community Water Reliability Act",
      originChamber: "House",
      latestAction: { text: "Referred to the Committee on Agriculture." },
      policyArea: "Agriculture and food",
      stage: "committee",
      officialUrl: "https://www.congress.gov/",
    },
    ...overrides,
  };
}

function renderRecords(
  records: CommitteeRecords,
  overrides: Partial<CommitteeRecordsResult> = {},
  committee = profile(),
) {
  return render(<CommitteeRecordsSection profile={committee} result={result(records, overrides)} />);
}

describe("the collection tabs", (): void => {
  it("offers all three collections with their counts", (): void => {
    renderRecords({ kind: "reports", items: [] }, { total: 142 });

    const tabs: HTMLElement = screen.getByRole("list", { name: "Record collections" });
    expect(within(tabs).getByRole("link", { name: /Bills Referred/ })).toBeInTheDocument();
    expect(within(tabs).getByText("10,205")).toBeInTheDocument();
    expect(within(tabs).getByText("142")).toBeInTheDocument();
  });

  it("prefers the fetched collection's own count over the committee record's", (): void => {
    // Congress.gov publishes two different counts for the same collection — House Agriculture's record says 17,795
    // bills while its bills endpoint says 10,205. The pageable one wins for the collection on screen, because printing
    // the larger figure over a list that runs out sooner is a contradiction anyone paging to the end can catch.
    renderRecords(
      { kind: "bills", items: [referral()] },
      { total: 10_205, pageCount: 851 },
      profile({ billCount: 17_795 }),
    );

    const tabs: HTMLElement = screen.getByRole("list", { name: "Record collections" });
    expect(within(tabs).getByText("10,205")).toBeInTheDocument();
    expect(within(tabs).queryByText("17,795")).not.toBeInTheDocument();
  });

  it("falls back to the committee record's count for the collections it did not fetch", (): void => {
    renderRecords({ kind: "reports", items: [] }, { total: 142 }, profile({ billCount: 17_795 }));

    expect(within(screen.getByRole("list", { name: "Record collections" })).getByText("17,795")).toBeInTheDocument();
  });

  it("falls back to the committee record's count when the fetch reported none", (): void => {
    renderRecords({ kind: "bills", items: [] }, { total: undefined }, profile({ billCount: 17_795 }));

    expect(within(screen.getByRole("list", { name: "Record collections" })).getByText("17,795")).toBeInTheDocument();
  });

  it("says a count was not reported rather than inventing a zero", (): void => {
    renderRecords({ kind: "bills", items: [] });

    const nominations: HTMLElement = screen.getByRole("link", { name: /Nominations Referred/ });
    expect(within(nominations).getByText("Not reported")).toBeInTheDocument();
  });

  it("makes every tab a link to this committee carrying the collection in the URL", (): void => {
    renderRecords({ kind: "bills", items: [] });

    expect(screen.getByRole("link", { name: /Reports Published/ })).toHaveAttribute(
      "href",
      "/committees/house/hsag00?records=reports",
    );
    // The default collection writes no param, so its tab is the bare committee URL.
    expect(screen.getByRole("link", { name: /Bills Referred/ })).toHaveAttribute("href", "/committees/house/hsag00");
  });

  it("resets to the first page when switching collections", (): void => {
    // A pager position carried from one collection into another means nothing in the second.
    renderRecords({ kind: "bills", items: [referral()] }, { page: 7, pageCount: 851, total: 10_205 });

    expect(screen.getByRole("link", { name: /Reports Published/ })).toHaveAttribute(
      "href",
      "/committees/house/hsag00?records=reports",
    );
  });

  it("marks the current collection with aria-current rather than only a color", (): void => {
    renderRecords({ kind: "reports", items: [] });

    expect(screen.getByRole("link", { name: /Reports Published/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Bills Referred/ })).not.toHaveAttribute("aria-current");
  });

  it("is a list of links rather than an ARIA tablist", (): void => {
    // These navigate — the records behind each live on a different endpoint and are fetched on the server — so
    // announcing them as tabs would promise arrow-key switching that never happens.
    renderRecords({ kind: "bills", items: [] });

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});

describe("referred bills", (): void => {
  it("names the measure, what the committee did with it, and when", (): void => {
    renderRecords({ kind: "bills", items: [referral()] });

    expect(screen.getByText("HR 10000")).toBeInTheDocument();
    expect(screen.getByText("Referred To")).toBeInTheDocument();
    expect(screen.getByText(/July 30, 2026/)).toBeInTheDocument();
  });

  it("links each measure to its own page in this app", (): void => {
    // Inward first: the bill page carries the verified outbound link onward, and answers "what else is this" besides.
    renderRecords({ kind: "bills", items: [referral()] });

    expect(screen.getByRole("link", { name: "Community Water Reliability Act" })).toHaveAttribute(
      "href",
      "/bills/119/hr/10000",
    );
  });

  it("falls back to the identifier when the title lookup found nothing", (): void => {
    renderRecords({ kind: "bills", items: [referral({ bill: undefined })] });

    expect(screen.getByRole("link", { name: "HR 10000" })).toHaveAttribute("href", "/bills/119/hr/10000");
  });

  it("omits the relationship chip when Congress.gov published none", (): void => {
    renderRecords({ kind: "bills", items: [referral({ relationship: undefined })] });

    expect(screen.queryByText("Referred To")).not.toBeInTheDocument();
  });

  it("says a date was not recorded rather than printing an empty line", (): void => {
    renderRecords({ kind: "bills", items: [referral({ actionDate: undefined, bill: undefined })] });

    expect(screen.getByText("Date not recorded")).toBeInTheDocument();
  });
});

describe("published reports", (): void => {
  const report: CommitteeReport = {
    citation: "H. Rept. 109-710",
    congress: 109,
    part: 1,
    updateDate: "2015-03-20T00:05:31+00:00",
  };

  it("names each report by its citation", (): void => {
    renderRecords({ kind: "reports", items: [report] });

    expect(screen.getByText("H. Rept. 109-710")).toBeInTheDocument();
    expect(screen.getByText(/109th Congress · Part 1 · Record updated March 20, 2015/)).toBeInTheDocument();
  });

  it("offers no outbound link, because the report's public URL cannot be verified from here", (): void => {
    renderRecords({ kind: "reports", items: [report] });

    const records: HTMLElement = screen.getByRole("region", { name: "What Has Come Through Here" });
    expect(within(records).queryByRole("link", { name: /H\. Rept/ })).not.toBeInTheDocument();
  });

  it("does not restate a part number the citation already spells out", (): void => {
    renderRecords({ kind: "reports", items: [{ citation: "H. Rept. 117-357,Part 1", congress: 117, part: 1 }] });

    expect(screen.getByText("117th Congress")).toBeInTheDocument();
  });

  it("says so plainly when the record carries nothing beyond its citation", (): void => {
    renderRecords({ kind: "reports", items: [{ citation: "H. Rept. 119-1" }] });

    expect(screen.getByText("Congress.gov publishes no further detail for this report.")).toBeInTheDocument();
  });
});

describe("referred nominations", (): void => {
  const nomination: CommitteeNomination = {
    citation: "PN1201-7",
    congress: 119,
    description: "Jane Doe, of Ohio, to be United States Marshal.",
    receivedDate: "2026-07-21",
    latestAction: { date: "2026-07-21", text: "Referred to the Committee on the Judiciary." },
  };

  it("prints the description the endpoint publishes inline", (): void => {
    renderRecords({ kind: "nominations", items: [nomination] });

    expect(screen.getByText("PN1201-7")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe, of Ohio, to be United States Marshal.")).toBeInTheDocument();
    expect(screen.getByText("Received July 21, 2026")).toBeInTheDocument();
    expect(screen.getByText("Referred to the Committee on the Judiciary.")).toBeInTheDocument();
  });

  it("says so when there is no recorded action or description", (): void => {
    renderRecords({ kind: "nominations", items: [{ citation: "PN1" }] });

    expect(screen.getByText("Congress.gov records no action on this nomination.")).toBeInTheDocument();
  });
});

describe("the pager", (): void => {
  it("stays off the page when the collection fits on one", (): void => {
    renderRecords({ kind: "bills", items: [referral()] });

    expect(screen.queryByRole("navigation", { name: /Pages of/ })).not.toBeInTheDocument();
  });

  it("links forward and back, carrying both params", (): void => {
    renderRecords(
      { kind: "reports", items: [{ citation: "H. Rept. 109-710" }] },
      { page: 4, pageCount: 12, total: 142 },
    );

    expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute(
      "href",
      "/committees/house/hsag00?records=reports&page=3",
    );
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute(
      "href",
      "/committees/house/hsag00?records=reports&page=5",
    );
  });

  it("links to both ends of the collection, so a reader deep in one can leave in a single step", (): void => {
    renderRecords(
      { kind: "reports", items: [{ citation: "H. Rept. 109-710" }] },
      { page: 4, pageCount: 12, total: 142 },
    );

    expect(screen.getByRole("link", { name: /First/ })).toHaveAttribute(
      "href",
      "/committees/house/hsag00?records=reports",
    );
    expect(screen.getByRole("link", { name: /Last/ })).toHaveAttribute(
      "href",
      "/committees/house/hsag00?records=reports&page=12",
    );
  });

  it("leaves the ends off when there is no middle for them to skip over", (): void => {
    // Across two pages "First" points where "Previous" does and "Last" where "Next" does, so the pair is furniture.
    renderRecords({ kind: "bills", items: [referral()] }, { page: 1, pageCount: 2, total: 24 });

    expect(screen.queryByText("First")).not.toBeInTheDocument();
    expect(screen.queryByText("Last")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Next/ })).toBeInTheDocument();
  });

  it("drops the page param when stepping back to the first page", (): void => {
    renderRecords({ kind: "bills", items: [referral()] }, { page: 2, pageCount: 3, total: 30 });

    expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute("href", "/committees/house/hsag00");
  });

  it("renders an edge as text rather than a control that does nothing", (): void => {
    renderRecords({ kind: "bills", items: [referral()] }, { page: 1, pageCount: 3, total: 30 });

    expect(screen.queryByRole("link", { name: /Previous/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /First/ })).not.toBeInTheDocument();
    expect(screen.getByText("Previous")).toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();

    renderRecords({ kind: "bills", items: [referral()] }, { page: 3, pageCount: 3, total: 30 });
    expect(screen.getAllByText("Next").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Last").length).toBeGreaterThan(0);
  });

  it("offers a page field that submits to this committee natively, without JavaScript", (): void => {
    renderRecords(
      { kind: "reports", items: [{ citation: "H. Rept. 109-710" }] },
      { page: 4, pageCount: 12, total: 142 },
    );

    const field: HTMLInputElement = screen.getByLabelText("Page");
    expect(field).toHaveAttribute("name", "page");
    expect(field).toHaveValue(4);
    // The range the collection actually has, so the browser can reject an overshoot before a request goes anywhere.
    expect(field).toHaveAttribute("min", "1");
    expect(field).toHaveAttribute("max", "12");
    expect(screen.getByText("of 12")).toBeInTheDocument();

    // A real GET form to the committee's own URL — not a click handler — so the jump produces a shareable address and
    // works with scripting off, exactly as every link in this section does.
    const form: HTMLFormElement | null = field.closest("form");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/committees/house/hsag00");
    // Jumping within the reports must not silently land in the bills.
    expect(form?.querySelector("input[name='records']")).toHaveValue("reports");
  });

  it("writes no collection param when the default one is showing", (): void => {
    // The same contract the tab and step links hold: a view at its default produces the bare committee URL rather than
    // one carrying a param that only restates the default.
    renderRecords({ kind: "bills", items: [referral()] }, { page: 2, pageCount: 3, total: 30 });

    expect(screen.getByLabelText("Page").closest("form")?.querySelector("input[name='records']")).toBeNull();
  });

  it("states the range in a live region, so paging is announced rather than only shown", (): void => {
    renderRecords({ kind: "bills", items: [referral()] }, { page: 2, pageCount: 851, total: 10_205 });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing 13–13 of 10,205, in the order Congress.gov publishes them.",
    );
  });
});

describe("the empty states", (): void => {
  it("never reports an unavailable collection as an empty one", (): void => {
    renderRecords({ kind: "reports", items: [] }, { unavailable: true, total: 142 });

    expect(screen.getByText(/temporarily unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/records no/)).not.toBeInTheDocument();
  });

  it("explains that only Senate committees receive nominations", (): void => {
    renderRecords({ kind: "nominations", items: [] });

    expect(screen.getByText(/Only Senate committees receive them\./)).toBeInTheDocument();
  });

  it("names the collection when a real committee has none of it", (): void => {
    renderRecords({ kind: "reports", items: [] });

    expect(screen.getByText("Congress.gov records no reports published by this committee.")).toBeInTheDocument();
  });

  it("says nothing about Congress for a placeholder committee", (): void => {
    // A preview committee's empty collection is a fact about the fixtures, not about the congressional record.
    renderRecords({ kind: "bills", items: [] }, {}, profile({ systemCode: "preview-01" }));

    expect(screen.getByText("Records appear here once live Congress.gov data is connected.")).toBeInTheDocument();
  });

  it("prints no range line when there is nothing on screen", (): void => {
    renderRecords({ kind: "bills", items: [] });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("what the section explains", (): void => {
  it("describes the collection on screen", (): void => {
    renderRecords({ kind: "bills", items: [referral()] });
    expect(screen.getByText(/A referral means a bill was sent here to be considered/)).toBeInTheDocument();

    renderRecords({ kind: "reports", items: [] });
    expect(screen.getByText(/Committee reports accompany a measure out of committee/)).toBeInTheDocument();
  });

  it("says the counts span the committee's whole existence", (): void => {
    renderRecords({ kind: "bills", items: [referral()] });

    expect(screen.getByText(/not the current Congress alone/)).toBeInTheDocument();
  });
});
