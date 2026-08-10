import type { JSX } from "react";

/**
 * Visually-hidden note that a link opens in a new tab.
 *
 * Every outbound link in this app carries a `lucide-react` external-link glyph, but that glyph is `aria-hidden` (it
 * conveys nothing a sighted reader can't already infer, and announcing "external link icon" would be noise). The result
 * was that a screen-reader user heard only the link text and got no warning before a new tab took focus — WCAG 3.2.5,
 * and a genuinely disorienting one when it happens mid-page.
 *
 * Kept as a component rather than a copied `<span className="sr-only">` so the wording is identical everywhere and a
 * link that opens a tab can't quietly ship without it.
 *
 * @returns The hidden hint. Render it inside the `<a>`, after the link text, so it lands at the end of the accessible
 *   name rather than in front of it.
 */
export function ExternalLinkHint(): JSX.Element {
  return <span className="sr-only"> (opens in a new tab)</span>;
}
