import type { JSX } from "react";

/**
 * The three strings a page header is made of.
 *
 * Named and exported because a route's header copy is occasionally worth writing down away from the markup that renders
 * it — `/bills` shares its header with its own loading skeleton, so that the two cannot drift into a layout shift.
 * @see CURRENT_CONGRESS_BILLS_HEADER.
 */
export type PageHeaderCopy = {
  /** Short category label above the title. */
  eyebrow: string;
  /** The page's heading. */
  title: string;
  /** One sentence on what the page is for. */
  description: string;
};

/**
 * Shared eyebrow/title/description banner used at the top of every top-level route.
 *
 * Owns the page's single `<h1>` and the `page-title` id that its section is labeled by, so no route has to remember to
 * establish either — and no two can accidentally both claim to be the page heading.
 *
 * @param props - @see PageHeaderCopy
 * @returns The banner.
 */
export function PageHeader({ eyebrow, title, description }: PageHeaderCopy): JSX.Element {
  return (
    <section className="page-header" aria-labelledby="page-title">
      <p className="eyebrow">{eyebrow}</p>
      <h1 id="page-title">{title}</h1>
      <p>{description}</p>
    </section>
  );
}
