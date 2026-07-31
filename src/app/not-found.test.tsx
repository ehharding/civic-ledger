/**
 * Covers the not-found boundary.
 *
 * Short, but the thing worth pinning is the one a 404 page usually gets wrong: it is a route back into the app rather
 * than a dead end. Every miss case in this app — an unmatched URL, a bill number naming nothing, an ID nobody holds —
 * lands here, so the exit has to be real.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NotFound from "@/app/not-found";

describe("NotFound", (): void => {
  it("says what happened under a single page heading", (): void => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("That Record Is Not in This Draft.");
    expect(screen.getByText("Not Found")).toBeInTheDocument();
  });

  it("offers a way back into the bill directory rather than a dead end", (): void => {
    render(<NotFound />);

    expect(screen.getByRole("link", { name: "Browse Bills" })).toHaveAttribute("href", "/bills");
  });

  it("keeps the site chrome, so the header navigation is still reachable from a 404", (): void => {
    render(<NotFound />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});
