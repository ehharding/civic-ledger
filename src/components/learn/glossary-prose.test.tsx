/**
 * Covers the bridge between the glossary's text matcher and the page.
 *
 * `annotateGlossaryTerms` already has its own tests for *which* words are found; what is pinned here is what the
 * renderer does with the answer — that a matched word becomes a link to its entry, that everything else is printed
 * verbatim, and above all that the sentence a reader sees is the sentence that was passed in.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GlossaryProse } from "@/components/learn/glossary-prose";
import { readerText } from "@/test/reader-text";

describe("GlossaryProse", (): void => {
  it("prints text containing no defined term unchanged, and links nothing", (): void => {
    const { container } = render(<GlossaryProse text="Nothing here is defined anywhere." />);

    expect(readerText(container)).toBe("Nothing here is defined anywhere.");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links a defined term to its own glossary entry, keeping the source's wording", (): void => {
    render(<GlossaryProse text="Most bills are referred to committees." />);

    expect(screen.getByRole("link", { name: "bills" })).toHaveAttribute("href", "/learn#glossary-bill");
    expect(screen.getByRole("link", { name: "referred" })).toHaveAttribute("href", "/learn#glossary-referred");
    expect(screen.getByRole("link", { name: "committees" })).toHaveAttribute("href", "/learn#glossary-committee");
  });

  it("leaves the sentence a reader sees identical to the one it was given", (): void => {
    // The point of the whole feature is annotation, not rewriting. A renderer that dropped a clause or normalized a
    // space would be editing congressional and editorial text in order to decorate it.
    const source: string = "Referred to the House Committee on the Judiciary, which held a hearing on the bill.";
    const { container } = render(<GlossaryProse text={source} />);

    expect(readerText(container)).toBe(source);
  });

  it("carries the matched term's own definition, not a neighbouring one", (): void => {
    render(<GlossaryProse text="A quorum was present." />);

    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent(
      "The number of members who must be present for a chamber to do business.",
    );
  });
});
