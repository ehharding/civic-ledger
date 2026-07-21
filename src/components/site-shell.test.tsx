/** Covers SiteShell's shared chrome: header, footer, and that children render inside the main landmark. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteShell } from "@/components/site-shell";

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
});
