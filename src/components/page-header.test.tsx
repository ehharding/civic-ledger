/** Covers PageHeader's rendering of its three props and the eyebrow/h1/description structure every route relies on. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "@/components/page-header";

describe("PageHeader", (): void => {
  it("renders the eyebrow, title, and description", (): void => {
    render(<PageHeader eyebrow="Legislation" title="Start With the Record." description="A short description." />);

    expect(screen.getByText("Legislation")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Start With the Record." })).toBeInTheDocument();
    expect(screen.getByText("A short description.")).toBeInTheDocument();
  });

  it("exposes the title's id for aria-labelledby consumers", (): void => {
    render(<PageHeader eyebrow="Legislation" title="Start With the Record." description="A short description." />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("id", "page-title");
  });
});
