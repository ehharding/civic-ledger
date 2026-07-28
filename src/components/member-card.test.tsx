/**
 * Covers MemberCard's rendering contract: one link (not two), the party label it shows, and the seat descriptions it
 * produces for a representative, a senator, an at-large seat, and a non-voting one.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MemberCard } from "@/components/member-card";
import type { MemberDirectoryEntry } from "@/lib/congress/members";

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
});
