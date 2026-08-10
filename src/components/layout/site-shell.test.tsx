/**
 * Covers SiteShell's shared chrome: header, footer, that children render inside the main landmark, and the skip link
 * that lets a keyboard user bypass the header on every route.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MAIN_CONTENT_ID, SiteShell } from "@/components/layout/site-shell";

describe("SiteShell", (): void => {
  it("renders the header, main content, and footer", (): void => {
    render(
      <SiteShell>
        <p>Page content</p>
      </SiteShell>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Page content");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Civic Ledger");
  });

  it("offers a skip link that targets the main landmark", (): void => {
    render(
      <SiteShell>
        <p>Page content</p>
      </SiteShell>,
    );

    expect(screen.getByRole("link", { name: "Skip to Main Content" })).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`);
    expect(screen.getByRole("main")).toHaveAttribute("id", MAIN_CONTENT_ID);
  });

  it("puts the skip link first, so it is the first thing a keyboard user reaches", (): void => {
    const { container } = render(
      <SiteShell>
        <p>Page content</p>
      </SiteShell>,
    );

    const focusable: NodeListOf<Element> = container.querySelectorAll("a, button, input, select");
    expect(focusable[0]).toHaveTextContent("Skip to Main Content");
  });

  it("makes the main landmark focusable, so the skip link actually moves focus", (): void => {
    render(
      <SiteShell>
        <p>Page content</p>
      </SiteShell>,
    );

    // Without this, some browsers scroll to the target but leave focus in the header — and the next Tab goes right back
    // into the navigation the user just skipped.
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
  });
});
