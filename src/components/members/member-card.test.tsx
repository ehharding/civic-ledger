/**
 * Covers MemberCard's rendering contract: one link (not two), the party label it shows, the seat descriptions it
 * produces for a representative, a senator, an at-large seat, and a non-voting one, and the portrait's three states.
 *
 * The portrait carries two rules worth pinning rather than trusting: its credit line is rendered whenever the record
 * publishes one, since showing the image at all is conditional on it, and its `alt` is empty on purpose — the name is
 * the very next thing in the card, so a described image would announce the same person twice.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MemberCard } from "@/components/members/member-card";
import type { MemberDirectoryEntry } from "@/lib/congress/members/model";

function entry(overrides: Partial<MemberDirectoryEntry> = {}): MemberDirectoryEntry {
  return {
    bioguideId: "B000001",
    name: "Bennett, Marcus T.",
    party: "democratic",
    partyName: "Democratic",
    state: "Ohio",
    district: 9,
    chamber: "house",
    ...overrides,
  };
}

describe("MemberCard", (): void => {
  it("links the member's name to their page", (): void => {
    render(<MemberCard entry={entry()} />);

    expect(screen.getByRole("link", { name: "Bennett, Marcus T." })).toHaveAttribute("href", "/members/B000001");
  });

  it("carries exactly one link, so assistive technology hears no duplicate", (): void => {
    render(<MemberCard entry={entry()} />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("shows the upstream party label verbatim, so a nuance isn't flattened", (): void => {
    render(<MemberCard entry={entry({ party: "independent", partyName: "Independent Democrat" })} />);

    expect(screen.getByText("Independent Democrat")).toBeInTheDocument();
  });

  it("falls back to the party group's label when the record carries none", (): void => {
    render(<MemberCard entry={entry({ partyName: undefined })} />);

    expect(screen.getByText("Democratic")).toBeInTheDocument();
  });

  it("describes a representative's district", (): void => {
    render(<MemberCard entry={entry()} />);

    expect(screen.getByText("House · Ohio's 9th district")).toBeInTheDocument();
  });

  it("describes a senator by state alone", (): void => {
    render(<MemberCard entry={entry({ chamber: "senate", state: "Arizona", district: undefined })} />);

    expect(screen.getByText("Senate · Arizona")).toBeInTheDocument();
  });

  it("describes a single-seat state as at-large", (): void => {
    render(<MemberCard entry={entry({ state: "Alaska", district: 0 })} />);

    expect(screen.getByText("House · Alaska at-large")).toBeInTheDocument();
  });

  it("marks a non-voting seat rather than drawing it as an ordinary one", (): void => {
    render(<MemberCard entry={entry({ state: "Guam", district: 0 })} />);

    expect(screen.getByText("House · Guam (non-voting seat)")).toBeInTheDocument();
  });

  it("falls back to the chamber's full name when no jurisdiction is on file", (): void => {
    render(<MemberCard entry={entry({ state: undefined, district: undefined })} />);

    expect(screen.getByText("House of Representatives")).toBeInTheDocument();
  });

  it("renders the portrait with its credit line, since showing one is conditional on the other", (): void => {
    const { container } = render(
      <MemberCard
        entry={entry({
          depiction: {
            imageUrl: "https://www.congress.gov/img/member/b000001_200.jpg",
            attribution: "Image courtesy of the Member",
          },
        })}
      />,
    );

    const image: HTMLImageElement = container.querySelector(".member-card__portrait-image") as HTMLImageElement;

    expect(image).toHaveAttribute("src", "https://www.congress.gov/img/member/b000001_200.jpg");
    // Empty rather than descriptive: the name is the next element and is the link, so an `alt` here would make a
    // screen reader announce the same person twice. Asserted because "no alt attribute at all" is a real bug that
    // reads as an unlabeled image, and it is one character away from this.
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(screen.getByText("Image courtesy of the Member")).toBeInTheDocument();
  });

  it("keeps a portrait the API published without a credit, rather than dropping the image", (): void => {
    // A handful of live records genuinely carry one and not the other. Discarding a real portrait over a field the
    // publisher left empty would lose a record the API did supply.
    const { container } = render(
      <MemberCard entry={entry({ depiction: { imageUrl: "https://www.congress.gov/img/member/b000001_200.jpg" } })} />,
    );

    expect(container.querySelector(".member-card__portrait-image")).toBeInTheDocument();
    expect(container.querySelector(".member-card__portrait-credit")).not.toBeInTheDocument();
  });

  it("renders no portrait at all for a record carrying none, which is every preview placeholder", (): void => {
    const { container } = render(<MemberCard entry={entry()} />);

    expect(container.querySelector(".member-card__portrait")).not.toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });
});
