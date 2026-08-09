/**
 * Covers the contract `OutboundLink` exists to make structural rather than remembered.
 *
 * Each assertion below stands for a way a hand-written outbound link ships incomplete: a missing `rel` leaking the
 * referrer, a missing `target` losing the reader's place, or — the one most easily forgotten, because nothing about it
 * is visible — a missing hint, leaving a screen-reader user with no warning before focus moves to a new tab.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OutboundLink } from "@/components/outbound-link";

describe("OutboundLink", (): void => {
  it("renders the link text and points at the given URL", (): void => {
    render(
      <OutboundLink href="https://www.congress.gov/bill/119th-congress/house-bill/284">
        Open the Official Record
      </OutboundLink>,
    );

    const link: HTMLElement = screen.getByRole("link", { name: /Open the Official Record/ });
    expect(link).toHaveAttribute("href", "https://www.congress.gov/bill/119th-congress/house-bill/284");
  });

  it("opens in a new tab without leaking the referrer", (): void => {
    render(<OutboundLink href="https://bioguide.congress.gov/search/bio/L000174">Official Biography</OutboundLink>);

    const link: HTMLElement = screen.getByRole("link", { name: /Official Biography/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("announces that it opens a new tab, which the visible glyph cannot do", (): void => {
    render(<OutboundLink href="https://example.gov/">Official Website</OutboundLink>);

    expect(screen.getByRole("link", { name: /opens in a new tab/i })).toBeInTheDocument();
  });

  it("puts the hint after the link text, so the accessible name still leads with what the link is", (): void => {
    render(<OutboundLink href="https://example.gov/">Official Website</OutboundLink>);

    expect(screen.getByRole("link", { name: /^Official Website/ })).toBeInTheDocument();
  });

  it("keeps the glyph out of the accessible name, since it conveys nothing a reader needs announced", (): void => {
    render(<OutboundLink href="https://example.gov/">Official Website</OutboundLink>);

    const link: HTMLElement = screen.getByRole("link", { name: /Official Website/ });
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("carries the text-link class by default and accepts a caller's own alongside it", (): void => {
    const { rerender } = render(<OutboundLink href="https://example.gov/">Default</OutboundLink>);
    expect(screen.getByRole("link", { name: /Default/ })).toHaveClass("text-link");

    rerender(
      <OutboundLink className="text-link seating-detail__link" href="https://example.gov/">
        Custom
      </OutboundLink>,
    );
    expect(screen.getByRole("link", { name: /Custom/ })).toHaveClass("text-link", "seating-detail__link");
  });
});
