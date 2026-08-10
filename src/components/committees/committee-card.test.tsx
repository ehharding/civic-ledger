/**
 * Covers CommitteeCard's rendering contract: one link (not two), the displayed name form, and the chamber-and-count
 * line for a committee with subcommittees, one without, and one that has exactly one.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CommitteeCard } from "@/components/committees/committee-card";
import type { CommitteeSummary } from "@/lib/congress/committees/model";

function committee(overrides: Partial<CommitteeSummary> = {}): CommitteeSummary {
  return {
    systemCode: "hsag00",
    name: "Agriculture Committee",
    chamber: "house",
    type: "standing",
    typeName: "Standing",
    subcommitteeCount: 0,
    ...overrides,
  };
}

describe("CommitteeCard", (): void => {
  /* Displayed verbatim: rewriting the word order is confined to search. @see committeeSearchTerms. */
  it("links the committee's name, exactly as published, to its page", (): void => {
    render(<CommitteeCard committee={committee()} />);

    expect(screen.getByRole("link", { name: "Agriculture Committee" })).toHaveAttribute(
      "href",
      "/committees/house/hsag00",
    );
  });

  it("does not rearrange a name whose proper form ends in 'Committee'", (): void => {
    render(<CommitteeCard committee={committee({ name: "Joint Economic Committee", chamber: "joint" })} />);

    expect(screen.getByRole("link", { name: "Joint Economic Committee" })).toBeInTheDocument();
  });

  it("carries exactly one link, so assistive technology hears no duplicate", (): void => {
    render(<CommitteeCard committee={committee()} />);

    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("routes a joint committee to its own chamber segment", (): void => {
    render(<CommitteeCard committee={committee({ chamber: "joint", systemCode: "jsec00" })} />);

    expect(screen.getByRole("link", { name: "Agriculture Committee" })).toHaveAttribute(
      "href",
      "/committees/joint/jsec00",
    );
  });

  it("shows the committee type", (): void => {
    render(<CommitteeCard committee={committee({ type: "select" })} />);

    expect(screen.getByText("Select or Special")).toBeInTheDocument();
  });

  it("names the chamber, and the subcommittee count when there is one", (): void => {
    render(<CommitteeCard committee={committee({ subcommitteeCount: 6 })} />);

    expect(screen.getByText("House · 6 subcommittees")).toBeInTheDocument();
  });

  it("pluralizes a single subcommittee correctly", (): void => {
    render(<CommitteeCard committee={committee({ subcommitteeCount: 1 })} />);

    expect(screen.getByText("House · 1 subcommittee")).toBeInTheDocument();
  });

  /* A count of zero says nothing worth the space, so the line is just the chamber. */
  it("omits the count entirely when there are no subcommittees", (): void => {
    render(<CommitteeCard committee={committee()} />);

    expect(screen.getByText("House")).toBeInTheDocument();
  });
});
