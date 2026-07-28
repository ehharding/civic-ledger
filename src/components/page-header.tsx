import type { JSX } from "react";

/**
 * Shared eyebrow/title/description banner used at the top of every top-level route.
 *
 * Owns the page's single `<h1>` and the `page-title` id that its section is labeled by, so no route has to remember to
 * establish either — and no two can accidentally both claim to be the page heading.
 *
 * @param eyebrow - Short category label above the title.
 * @param title - The page's heading.
 * @param description - One sentence on what the page is for.
 * @returns The banner.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}): JSX.Element {
  return (
    <section className="page-header" aria-labelledby="page-title">
      <p className="eyebrow">{eyebrow}</p>
      <h1 id="page-title">{title}</h1>
      <p>{description}</p>
    </section>
  );
}
