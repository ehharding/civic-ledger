/**
 * Covers the back link all three detail pages open with.
 *
 * Four lines of markup, and every one of them is a contract that three pages used to hold separately: the glyph stays
 * decorative, the accessible name is the destination rather than "Back", and the class is the one `layout.css` styles.
 * Those are exactly the things a copied block drifts on without anything looking wrong.
 */
import { render, screen } from "@testing-library/react";
import type { Route } from "next";
import { describe, expect, it } from "vitest";

import { DetailBackLink } from "@/components/ui/detail-back-link";

describe("DetailBackLink", (): void => {
  it("links to the directory it names", (): void => {
    render(<DetailBackLink href={"/committees" as Route} label="All Committees" />);

    expect(screen.getByRole("link", { name: "All Committees" })).toHaveAttribute("href", "/committees");
  });

  it("keeps the chevron out of the accessible name, so the link reads as its destination alone", (): void => {
    const { container } = render(<DetailBackLink href={"/bills" as Route} label="All Bills" />);

    // `getByRole` matches on the accessible name, so an un-hidden glyph would break this rather than merely add noise.
    expect(screen.getByRole("link", { name: "All Bills" })).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("wears the shared class the three detail pages are styled through", (): void => {
    const { container } = render(<DetailBackLink href={"/members" as Route} label="All Members" />);

    expect(container.querySelector(".detail-backlink")).not.toBeNull();
  });
});
