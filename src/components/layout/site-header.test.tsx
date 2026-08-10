/** Covers SiteHeader's wordmark link, primary nav destinations, and the search form's action/name attributes. */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteHeader } from "@/components/layout/site-header";

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

  describe("under a basePath", (): void => {
    afterEach((): void => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    /*
     * The GitHub Pages demo is served from /<repo>, not a domain root. Next rewrites `next/link` hrefs for that, but it
     * has no way to rewrite a raw `action` attribute — and this form is deliberately a plain form so it works with no
     * JavaScript, which puts it outside the rewriting. A literal action="/bills" therefore 404s on the demo while
     * looking correct everywhere else, which is exactly the kind of break nothing local would catch.
     */
    it("prefixes the search form's action so the static demo doesn't post to the domain root", async (): Promise<void> => {
      vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/civic-ledger");
      vi.resetModules();
      const { SiteHeader: Prefixed } = await import("@/components/layout/site-header");

      const { container } = render(<Prefixed />);

      expect(container.querySelector("form.header-search")).toHaveAttribute("action", "/civic-ledger/bills");
    });
  });
});
