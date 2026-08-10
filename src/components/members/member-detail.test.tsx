/**
 * Covers MemberDetail's rendering contract: the identity heading, the service record, the honest handling of a
 * placeholder member (no biography link, labeled data), the truncation copy that keeps a capped list from reading as a
 * complete one, and the fact that the page reports service rather than scoring it.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MemberDetail } from "@/components/members/member-detail";
import type { LegislativeBill } from "@/lib/congress/bills/model";
import type { MemberProfile } from "@/lib/congress/members/model";

function profile(overrides: Partial<MemberProfile> = {}): MemberProfile {
  return {
    bioguideId: "L000174",
    name: "Leahy, Patrick J.",
    directOrderName: "Patrick J. Leahy",
    party: "democratic",
    partyName: "Democrat",
    state: "Vermont",
    chamber: "senate",
    currentMember: true,
    terms: [{ chamber: "senate", congress: 117, startYear: 2021, memberType: "Senator" }],
    leadership: [],
    ...overrides,
  };
}

const bill: LegislativeBill = {
  congress: 117,
  type: "S",
  number: "4417",
  title: "A Sponsored Bill",
  originChamber: "Senate",
  latestAction: { date: "2022-06-16", text: "Read twice and referred to Committee." },
  stage: "committee",
  officialUrl: "https://www.congress.gov/bill/117th-congress/senate-bill/4417",
};

function renderMember(props: Partial<Parameters<typeof MemberDetail>[0]> = {}) {
  return render(
    <MemberDetail cosponsored={[]} legislationLimit={12} profile={profile()} source="live" sponsored={[]} {...props} />,
  );
}

describe("MemberDetail", (): void => {
  it("titles the page with the member's reading-order name", (): void => {
    renderMember();

    expect(screen.getByRole("heading", { level: 1, name: "Patrick J. Leahy" })).toBeInTheDocument();
  });

  it("states the title, chamber, party, seat, and length of service", (): void => {
    renderMember();

    expect(screen.getByText("Senator · Senate")).toBeInTheDocument();
    expect(screen.getByText("Democrat")).toBeInTheDocument();
    expect(screen.getByText("Vermont")).toBeInTheDocument();
    expect(screen.getByText("Serving since 2021")).toBeInTheDocument();
  });

  it("describes a House member's district rather than just their state", (): void => {
    renderMember({
      profile: profile({
        chamber: "house",
        state: "Ohio",
        district: 9,
        terms: [{ chamber: "house", congress: 119, startYear: 2025, memberType: "Representative" }],
      }),
    });

    expect(screen.getByText("Ohio's 9th district")).toBeInTheDocument();
  });

  it("marks a former member as no longer serving", (): void => {
    renderMember({ profile: profile({ currentMember: false }) });

    expect(screen.getByText("No longer serving")).toBeInTheDocument();
  });

  it("lists every term in the service record", (): void => {
    renderMember({
      profile: profile({
        terms: [
          { chamber: "senate", congress: 117, startYear: 2021, memberType: "Senator" },
          { chamber: "house", congress: 116, startYear: 2019, endYear: 2021, memberType: "Representative" },
        ],
      }),
    });

    expect(screen.getByText(/117th Congress · 2021–present/)).toBeInTheDocument();
    expect(screen.getByText(/116th Congress · 2019–2021/)).toBeInTheDocument();
  });

  it("links to the official biography and the member's own site", (): void => {
    renderMember({ profile: profile({ officialWebsiteUrl: "https://www.leahy.senate.gov" }) });

    expect(screen.getByRole("link", { name: /Official Biography/ })).toHaveAttribute(
      "href",
      "https://bioguide.congress.gov/search/bio/L000174",
    );
    expect(screen.getByRole("link", { name: /Official Website/ })).toHaveAttribute(
      "href",
      "https://www.leahy.senate.gov",
    );
  });

  it("warns that outbound links open a new tab", (): void => {
    renderMember();

    expect(screen.getByRole("link", { name: /Official Biography/ })).toHaveAccessibleName(/opens in a new tab/);
  });

  it("offers no biography link for a placeholder member, and says why", (): void => {
    renderMember({
      profile: profile({ bioguideId: "PREVIEW-1" }),
      source: "preview",
      notice: "This is an illustrative placeholder member.",
    });

    expect(screen.queryByRole("link", { name: /Official Biography/ })).not.toBeInTheDocument();
    expect(screen.getByText(/no official biography to link to/)).toBeInTheDocument();
  });

  it("shows sponsored bills as ordinary bill cards", (): void => {
    renderMember({ sponsored: [bill], profile: profile({ sponsoredCount: 1 }) });

    const section: HTMLElement = screen.getByRole("region", { name: "Bills They Introduced" });
    expect(within(section).getByRole("link", { name: "A Sponsored Bill" })).toHaveAttribute(
      "href",
      "/bills/117/s/4417",
    );
  });

  it("says a capped list is a slice rather than letting it read as the whole record", (): void => {
    renderMember({ sponsored: [bill], profile: profile({ sponsoredCount: 1753 }), legislationLimit: 12 });

    expect(screen.getByText(/Showing the 1 most recent of 1753 on file/)).toBeInTheDocument();
  });

  it("does not claim truncation when the list is complete", (): void => {
    renderMember({ sponsored: [bill], profile: profile({ sponsoredCount: 1 }) });

    expect(screen.getByText("1 on file.")).toBeInTheDocument();
  });

  it("treats an empty legislation list as an ordinary state, not an error", (): void => {
    renderMember();

    expect(screen.getByText(/records no sponsored legislation/)).toBeInTheDocument();
    expect(screen.getByText(/records no cosponsored legislation/)).toBeInTheDocument();
  });

  it("says plainly that sponsorship is not a scorecard", (): void => {
    renderMember();

    expect(screen.getByText(/not that it passed, not how they voted/)).toBeInTheDocument();
  });

  it("renders the portrait with its required credit line", (): void => {
    renderMember({
      profile: profile({
        depiction: {
          imageUrl: "https://www.congress.gov/img/member/l000174.jpg",
          attribution: "<a>Courtesy U.S. Senate Historical Office</a>",
        },
      }),
    });

    expect(screen.getByRole("img", { name: "Official portrait of Patrick J. Leahy" })).toBeInTheDocument();
    expect(screen.getByText(/Senate Historical Office/)).toBeInTheDocument();
  });
});

describe("MemberDetail with a sparse record", (): void => {
  it("renders a portrait with no credit line when the record carries none", (): void => {
    renderMember({
      profile: profile({ depiction: { imageUrl: "https://www.congress.gov/img/member/l000174.jpg" } }),
    });

    expect(screen.getByRole("img", { name: /Official portrait/ })).toBeInTheDocument();
    // No `<figcaption>` at all, rather than an empty one that reads as a missing credit.
    expect(document.querySelector(".member-portrait__credit")).toBeNull();
  });

  it("falls back to the chamber's name when a term names no member type", (): void => {
    renderMember({
      profile: profile({ terms: [{ chamber: "senate", congress: 117, startYear: 2021 }] }),
    });

    // The row names the chamber where it would otherwise name the office held.
    expect(document.querySelector(".member-terms__chamber")).toHaveTextContent("Senate");
  });

  it("falls back to the chamber's name when a term names no congress", (): void => {
    renderMember({
      profile: profile({ terms: [{ chamber: "senate", memberType: "Senator", startYear: 2021 }] }),
    });

    // The detail column would otherwise read as an empty span beside the chamber.
    expect(document.querySelector(".member-terms__detail")).toHaveTextContent("Senate");
  });

  it("omits the year span for a term with no years on file", (): void => {
    renderMember({
      profile: profile({ terms: [{ chamber: "senate", congress: 117, memberType: "Senator" }] }),
    });

    expect(screen.getByText("117th Congress")).toBeInTheDocument();
  });

  it("says so plainly when Congress.gov publishes no term history at all", (): void => {
    renderMember({ profile: profile({ terms: [] }) });

    expect(screen.getByText("Congress.gov publishes no term history for this member.")).toBeInTheDocument();
  });

  it("omits the seat and service lines when neither can be derived", (): void => {
    renderMember({ profile: profile({ state: undefined, terms: [{ chamber: "senate" }] }) });

    expect(screen.queryByText("Vermont")).not.toBeInTheDocument();
    expect(screen.queryByText(/Serving since/)).not.toBeInTheDocument();
  });

  it("lists leadership roles, naming the Congress only when the record carries one", (): void => {
    renderMember({
      profile: profile({
        leadership: [{ type: "President pro tempore", congress: 117 }, { type: "Committee Chair" }],
      }),
    });

    const roles: HTMLElement = screen.getByRole("list", { name: "Leadership roles" });
    expect(within(roles).getByText(/President pro tempore · 117th Congress/)).toBeInTheDocument();
    expect(within(roles).getByText("Committee Chair")).toBeInTheDocument();
  });
});
