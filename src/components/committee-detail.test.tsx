/**
 * Covers CommitteeDetail's rendering contract, bringing it to the same footing as `BillDetail` and `MemberDetail`.
 *
 * Two of the assertions here are about what the page *refuses* to say, and those are the load-bearing ones.
 * Congress.gov publishes no committee membership, so this page carries no roster — the component's own documentation
 * calls a fabricated one "the single most plausible-looking fabrication this app could ship", since a list of names
 * under a committee heading reads as a fact whatever caveat sits beside it. And a placeholder committee must never be
 * handed an outbound link that implies an official record exists for it. Neither rule is enforced by a type, so each
 * gets a test.
 *
 * The rest is the ordinary contract: the heading, the type explainer, the name history, the counts that are omitted
 * rather than zeroed when absent, and the subcommittee list's two different empty states.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CommitteeDetail } from "@/components/committee-detail";
import type { CommitteeRecordsResult } from "@/lib/congress/committee-records";
import type { CommitteeProfile } from "@/lib/congress/committees";

/**
 * An empty, successfully-fetched page of referrals — the records shape most of these cases don't care about.
 *
 * `total: undefined` rather than `0`, so the tabs fall back to the *committee's* own counts and these cases test what
 * they mean to: that this component passes the profile's figures through. @see countFor, which prefers a fetched count
 * over the profile's for whichever collection is on screen.
 */
function noRecords(): CommitteeRecordsResult {
  return { records: { kind: "bills", items: [] }, page: 1, pageCount: 1, total: undefined, unavailable: false };
}

function profile(overrides: Partial<CommitteeProfile> = {}): CommitteeProfile {
  return {
    systemCode: "hsag00",
    name: "Agriculture Committee",
    chamber: "house",
    type: "standing",
    typeName: "Standing",
    subcommitteeCount: 1,
    isCurrent: true,
    history: [
      {
        name: "Committee on Agriculture",
        startDate: "1975-01-14T00:00:00Z",
        establishingAuthority: "House Rule X",
      },
    ],
    subcommittees: [{ systemCode: "hsag14", name: "Subcommittee on Livestock" }],
    billCount: 1284,
    reportCount: 96,
    ...overrides,
  };
}

function renderCommittee(
  overrides: Partial<CommitteeProfile> = {},
  props: { source?: "live" | "preview"; records?: CommitteeRecordsResult } = {},
) {
  return render(
    <CommitteeDetail
      profile={profile(overrides)}
      records={props.records ?? noRecords()}
      source={props.source ?? "live"}
    />,
  );
}

describe("CommitteeDetail", (): void => {
  it("titles the page with the committee's name and names its type and chamber", (): void => {
    renderCommittee();

    expect(screen.getByRole("heading", { level: 1, name: "Agriculture Committee" })).toBeInTheDocument();
    expect(screen.getByText("Standing · House of Representatives")).toBeInTheDocument();
  });

  it("explains what that kind of committee is, rather than only labeling it", (): void => {
    // The reason the app has a committees section at all: a directory that prints "Standing" without ever saying what
    // it means teaches a reader nothing they did not already know.
    renderCommittee();

    expect(screen.getByText(/A permanent committee, created by a chamber's own rules/)).toBeInTheDocument();
  });

  it("carries no membership roster, because Congress.gov publishes none", (): void => {
    renderCommittee();

    expect(screen.queryByRole("heading", { name: /members?/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/chair/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ranking member/i)).not.toBeInTheDocument();
  });

  it("links back to the directory rather than the home page", (): void => {
    renderCommittee();

    expect(screen.getByRole("link", { name: /All Committees/ })).toHaveAttribute("href", "/committees");
  });

  describe("recorded history", (): void => {
    it("lists each name with the span it was used", (): void => {
      renderCommittee({
        history: [
          { name: "Committee on Education and the Workforce", startDate: "2023-01-03T00:00:00Z" },
          {
            name: "Committee on Education and Labor",
            startDate: "2019-01-03T00:00:00Z",
            endDate: "2023-01-02T00:00:00Z",
          },
        ],
      });

      expect(screen.getByText("Committee on Education and the Workforce")).toBeInTheDocument();
      expect(screen.getByText("2023–present")).toBeInTheDocument();
      expect(screen.getByText("2019–2023")).toBeInTheDocument();
    });

    it("names the establishing authority when the record carries one", (): void => {
      renderCommittee();

      expect(screen.getByText(/House Rule X/)).toBeInTheDocument();
    });

    it("says so plainly when an entry has no dates, rather than printing an empty span", (): void => {
      renderCommittee({ history: [{ name: "Committee on Agriculture" }] });

      expect(screen.getByText("Dates not recorded")).toBeInTheDocument();
    });

    it("says so when there is no history at all", (): void => {
      renderCommittee({ history: [] });

      expect(screen.getByText("Congress.gov publishes no name history for this committee.")).toBeInTheDocument();
    });
  });

  describe("record collections", (): void => {
    it("prints each collection's count, with thousands separated", (): void => {
      renderCommittee();

      const records: HTMLElement = screen.getByRole("region", { name: "What Has Come Through Here" });
      expect(within(records).getByText("Bills Referred")).toBeInTheDocument();
      expect(within(records).getByText("1,284")).toBeInTheDocument();
      expect(within(records).getByText("96")).toBeInTheDocument();
    });

    it("says a count was not reported rather than printing it as zero", (): void => {
      // "Congress.gov didn't say" and "none" are different claims, and a zero would make the first read as the second.
      renderCommittee();

      const records: HTMLElement = screen.getByRole("region", { name: "What Has Come Through Here" });
      expect(within(records).getByText("Nominations Referred")).toBeInTheDocument();
      expect(within(records).getByText("Not reported")).toBeInTheDocument();
    });

    it("shows a real zero when the record actually reports one", (): void => {
      renderCommittee({ nominationCount: 0 });

      const records: HTMLElement = screen.getByRole("region", { name: "What Has Come Through Here" });
      expect(within(records).getByText("0")).toBeInTheDocument();
      expect(within(records).queryByText("Not reported")).not.toBeInTheDocument();
    });

    it("keeps the section even when the record carries no counts at all", (): void => {
      // The counts are now headings over records the page can still fetch, so their absence no longer means there is
      // nothing to show.
      renderCommittee({ billCount: undefined, reportCount: undefined, nominationCount: undefined });

      expect(screen.getByRole("region", { name: "What Has Come Through Here" })).toBeInTheDocument();
    });

    it("says a referral is not a verdict", (): void => {
      renderCommittee();

      expect(screen.getByText(/not that it was taken up, amended, or reported out/)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "A Referral Is Not a Vote." })).toBeInTheDocument();
    });
  });

  describe("subcommittees", (): void => {
    it("links to each one", (): void => {
      renderCommittee();

      expect(screen.getByRole("link", { name: "Subcommittee on Livestock" })).toHaveAttribute(
        "href",
        "/committees/house/hsag14",
      );
    });

    it("distinguishes 'none recorded' from 'this is itself a subcommittee'", (): void => {
      renderCommittee({ subcommittees: [], subcommitteeCount: 0 });
      expect(screen.getByText("Congress.gov records no subcommittees for this committee.")).toBeInTheDocument();

      renderCommittee({
        subcommittees: [],
        subcommitteeCount: 0,
        parent: { systemCode: "hsag00", name: "Agriculture Committee" },
      });
      expect(screen.getByText("This is itself a subcommittee, so nothing sits below it.")).toBeInTheDocument();
    });

    it("links a subcommittee back up to its parent", (): void => {
      renderCommittee({
        systemCode: "hsag14",
        name: "Subcommittee on Livestock",
        parent: { systemCode: "hsag00", name: "Agriculture Committee" },
        subcommittees: [],
      });

      expect(screen.getByRole("link", { name: "Agriculture Committee" })).toHaveAttribute(
        "href",
        "/committees/house/hsag00",
      );
    });
  });

  describe("provenance", (): void => {
    it("prints the system code and links out for a real committee", (): void => {
      // The system code is what actually identifies the committee on the destination page, which is why it is printed
      // beside a link to the index rather than guessed into a per-committee deep link.
      renderCommittee();

      expect(screen.getByText("hsag00")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Committees on Congress.gov/ })).toHaveAttribute(
        "href",
        "https://www.congress.gov/committees",
      );
    });

    it("offers a placeholder committee no official link at all", (): void => {
      // A preview record's system code cannot be a real one, and linking out from it would imply an official record
      // that does not exist.
      renderCommittee({ systemCode: "preview-01", name: "Preview Public Works Committee" }, { source: "preview" });

      expect(screen.queryByRole("link", { name: /Committees on Congress.gov/ })).not.toBeInTheDocument();
      expect(screen.getByText(/This is a placeholder committee/)).toBeInTheDocument();
    });

    it("discloses the data source on every render", (): void => {
      renderCommittee();
      expect(screen.getByRole("complementary", { name: "Data source" })).toHaveTextContent("Live Congress.gov Data");

      renderCommittee({}, { source: "preview" });
      expect(screen.getAllByRole("complementary", { name: "Data source" })[1]).toHaveTextContent("Preview Data");
    });

    it("marks a committee that no longer exists", (): void => {
      renderCommittee({ isCurrent: false });

      expect(screen.getByText("No longer active")).toBeInTheDocument();
    });

    it("says nothing about currency for a committee that still exists", (): void => {
      renderCommittee();

      expect(screen.queryByText("No longer active")).not.toBeInTheDocument();
    });
  });
});
