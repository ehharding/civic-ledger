/**
 * Reads an element's text the way a person sees it, rather than the way `textContent` does.
 *
 * The two disagree in exactly one place, and it is deliberate. `GlossaryTermTip` keeps every definition bubble mounted
 * whether or not it is showing, because `aria-describedby` has to be able to resolve it the instant the term takes
 * focus — so a paragraph containing a defined word carries that word's whole definition inside its `textContent`, and
 * an assertion like `getByText("Referred to the House Committee on the Judiciary.")` stops matching even though the
 * rendered sentence is unchanged.
 *
 * Stripping the bubbles here keeps those assertions about the sentence rather than about the markup that happens to
 * carry it. The bubbles themselves are pinned directly, in `glossary-term-tip.test.tsx`.
 */

/**
 * An element's visible text, with any glossary definition bubbles removed.
 *
 * @param element - The element to read. Operates on a clone, so the rendered tree is left untouched and the same
 *   element can be read again.
 * @returns The text, exactly as it reads on screen.
 */
export function readerText(element: Element): string {
  const clone: Element = element.cloneNode(true) as Element;

  for (const tip of clone.querySelectorAll(".glossary-term__tip")) tip.remove();

  return clone.textContent ?? "";
}
