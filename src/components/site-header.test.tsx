/** Covers SiteHeader's wordmark link, primary nav destinations, and the search form's action/name attributes. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteHeader } from "@/components/site-header";

describe("SiteHeader", (): void => {
  it("links the wordmark to the homepage", (): void => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Civic Ledger home" })).toHaveAttribute("href", "/");
  });

  it("renders the primary nav with the expected destinations", (): void => {
    render(<SiteHeader />);
    const primaryNav: HTMLElement = screen.getByRole("navigation", { name: "Primary navigation" });

    expect(primaryNav.querySelector('a[href="/bills"]')).toHaveTextContent("Bills");
    expect(primaryNav.querySelector('a[href="/members"]')).toHaveTextContent("Members");
    expect(primaryNav.querySelector('a[href="/committees"]')).toHaveTextContent("Committees");
    expect(primaryNav.querySelector('a[href="/learn"]')).toHaveTextContent("Learn");
    expect(primaryNav.querySelector('a[href="/about"]')).toHaveTextContent("Methodology");
  });

  /*
   * The nav's length is the thing that decides whether the header still fits on a phone — five destinations is what
   * moved it onto a row of its own below 640px. A sixth arriving without anyone revisiting that decision is exactly the
   * kind of change that ships looking fine on a laptop, so this asserts the count rather than only the members.
   */
  it("carries exactly the five primary destinations", (): void => {
    render(<SiteHeader />);
    const primaryNav: HTMLElement = screen.getByRole("navigation", { name: "Primary navigation" });

    expect(primaryNav.querySelectorAll("a")).toHaveLength(5);
  });

  it("submits the search form's q param to /bills", (): void => {
    const { container } = render(<SiteHeader />);
    const form: Element | null = container.querySelector("form.header-search");

    expect(form).toHaveAttribute("action", "/bills");
    expect(screen.getByRole("searchbox", { name: "Search bills" })).toHaveAttribute("name", "q");
  });
});
