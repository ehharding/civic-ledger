/**
 * Covers SiteHeader's wordmark link, the presence of the nav landmark, and the search form's action/name attributes.
 *
 * The nav's own contents — its five destinations and the `aria-current` marking derived from the open path — are
 * covered in primary-nav.test.tsx, beside the component that now owns them. What belongs here is only that the header
 * still composes the three parts.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteHeader } from "@/components/layout/site-header";

describe("SiteHeader", (): void => {
  it("links the wordmark to the homepage", (): void => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Civic Ledger home" })).toHaveAttribute("href", "/");
  });

  it("renders the primary nav landmark", (): void => {
    render(<SiteHeader />);

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
  });

  /*
   * PrimaryNav is a client component reading usePathname, which returns null outside a router — as here, where the
   * header is rendered on its own. That has to degrade to an unmarked nav rather than an exception, since a throw in
   * the nav takes the wordmark and the search box down with it.
   * @see navCurrent.
   */
  it("renders without a router, marking nothing current", (): void => {
    render(<SiteHeader />);
    const primaryNav: HTMLElement = screen.getByRole("navigation", { name: "Primary navigation" });

    expect(primaryNav.querySelectorAll("a")).toHaveLength(5);
    expect(primaryNav.querySelectorAll("a[aria-current]")).toHaveLength(0);
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
