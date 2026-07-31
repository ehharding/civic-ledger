/**
 * Covers the citation list: that it names each source's publisher, and that every link inherits the outbound-link
 * contract rather than being a bare anchor. The second half is the point — a citation that opened in place, or that
 * leaked a referrer, or that told a screen-reader user nothing about the tab it was about to open, would be a
 * regression nobody would see by looking at the page.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LessonSources } from "@/components/lesson-sources";
import type { LessonSource } from "@/lib/lessons";

const sources: LessonSource[] = [
  {
    title: "About Voting",
    publisher: "U.S. Senate",
    href: "https://www.senate.gov/about/powers-procedures/voting.htm",
  },
  { title: "Roll Call Votes", publisher: "Office of the Clerk, U.S. House", href: "https://clerk.house.gov/Votes" },
];

describe("LessonSources", (): void => {
  it("names the section by its own heading", (): void => {
    render(<LessonSources sources={sources} headingId="sources-heading" />);
    expect(screen.getByRole("region", { name: "Sources" })).toBeInTheDocument();
  });

  it("states that the lesson is this app's writing, not Congress's", (): void => {
    render(<LessonSources sources={sources} headingId="sources-heading" />);
    expect(screen.getByText(/written by Civic Ledger, not published by Congress/)).toBeInTheDocument();
  });

  it("lists every source with its publisher beside it", (): void => {
    render(<LessonSources sources={sources} headingId="sources-heading" />);

    const items: HTMLElement[] = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText("U.S. Senate")).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText("Office of the Clerk, U.S. House")).toBeInTheDocument();
  });

  it("opens each citation in a new tab, without a referrer, and says so audibly", (): void => {
    render(<LessonSources sources={sources} headingId="sources-heading" />);

    const link: HTMLElement = screen.getByRole("link", { name: /About Voting/ });
    expect(link).toHaveAttribute("href", "https://www.senate.gov/about/powers-procedures/voting.htm");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    // ExternalLinkHint's wording, folded into the link's accessible name by OutboundLink.
    expect(link).toHaveAccessibleName(/new tab/i);
  });
});
