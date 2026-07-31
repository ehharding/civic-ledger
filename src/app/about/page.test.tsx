/**
 * Covers the Methodology route.
 *
 * Entirely static, so the useful assertions are about the commitments it publishes rather than about data flow: the
 * three principles are the ones the rest of the codebase is written to keep, and the page states them publicly so they
 * can be held against the product. A test that only counted `<article>` elements would let any of them be reworded into
 * something the code no longer does.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AboutPage, { metadata } from "@/app/about/page";
import { SITE_NAME } from "@/lib/metadata";

describe("AboutPage", (): void => {
  it("renders inside the site chrome under a single page heading", (): void => {
    render(<AboutPage />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Civic Information Deserves Good Product Thinking.",
    );
  });

  it("publishes all three principles, each as its own second-level heading", (): void => {
    render(<AboutPage />);

    for (const title of ["Primary Sources First", "Useful Without Persuasion", "Clear About Uncertainty"]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }
  });

  it("states the commitment each principle stands for, not just its title", (): void => {
    render(<AboutPage />);

    expect(
      screen.getByText(/links people to the corresponding official record instead of replacing it/),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not tell people what position to hold/)).toBeInTheDocument();
    expect(screen.getByText(/Source freshness and preview states stay visible/)).toBeInTheDocument();
  });

  it("hides each principle's decorative icon from assistive technology", (): void => {
    const { container } = render(<AboutPage />);

    const icons: NodeListOf<Element> = container.querySelectorAll(".principle svg");
    expect(icons).toHaveLength(3);
    for (const icon of icons) expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("names itself and its canonical path rather than inheriting the site-wide card", (): void => {
    expect(metadata.title).toBe("About");
    expect(metadata.alternates?.canonical).toBe("/about");
    expect(metadata.openGraph?.title).toBe(`About — ${SITE_NAME}`);
  });
});
