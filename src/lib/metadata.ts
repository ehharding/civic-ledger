import type { Metadata } from "next";

/**
 * How a page describes itself to search results and link previews. Next doesn't derive Open Graph or Twitter tags from
 * `title` and `description`, so every page composes them with one {@link pageMetadata} call.
 */

/** The site's name, as it appears in a title suffix and as the `og:site_name` of every page. */
export const SITE_NAME: string = "Civic Ledger";

/** The home page's own title. Used verbatim rather than run through {@link SITE_TITLE_TEMPLATE}. */
export const SITE_DEFAULT_TITLE: string = `${SITE_NAME} — Congress in Context`;

/**
 * The suffix every other page's title carries. Applied by hand in {@link pageMetadata} too, since Next's title template
 * doesn't reach `openGraph.title`.
 */
export const SITE_TITLE_TEMPLATE: string = `%s — ${SITE_NAME}`;

/** The site-wide description, and the fallback for any page that doesn't have a more specific one of its own. */
export const SITE_DESCRIPTION: string = "A source-conscious guide to the work of the United States Congress.";

/**
 * The link-preview card's size, shared with `src/app/opengraph-image.tsx`. The image is restated in
 * {@link pageMetadata} because a child's `openGraph` replaces the parent's wholesale, dropping the convention-attached
 * image.
 */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** The card's alternative text, for readers whose client announces a link preview rather than rendering it. */
export const OG_IMAGE_ALT: string = `${SITE_NAME} — ${SITE_DESCRIPTION}`;

/** The route Next serves the generated card from. @see src/app/opengraph-image.tsx */
const OG_IMAGE_PATH: string = "/opengraph-image";

/** What {@link pageMetadata} needs to describe one page. */
type PageMetadataInput = {
  /** The page's own title, *without* the site suffix — the same string you would put in `metadata.title`. */
  title: string;
  /** One sentence describing this page. Defaults to {@link SITE_DESCRIPTION}. */
  description?: string;
  /** The page's canonical root-relative path (`"/members/L000174"`), resolved against `metadataBase`. */
  path?: string;
};

/**
 * Builds one page's full metadata: title, description, canonical URL, and Open Graph and Twitter card tags. `og:type`
 * is always `"website"`: these pages are views onto a public record, not authored articles.
 *
 * @param input - @see PageMetadataInput
 * @returns Metadata ready to return from a `generateMetadata` or assign to a page's `metadata` export.
 */
export function pageMetadata({ title, description, path }: PageMetadataInput): Metadata {
  const resolvedDescription: string = description ?? SITE_DESCRIPTION;
  const socialTitle: string = SITE_TITLE_TEMPLATE.replace("%s", title);

  return {
    title,
    description: resolvedDescription,
    ...(path ? { alternates: { canonical: path } } : {}),
    openGraph: {
      title: socialTitle,
      description: resolvedDescription,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
      images: [{ url: OG_IMAGE_PATH, alt: OG_IMAGE_ALT, ...OG_IMAGE_SIZE }],
      ...(path ? { url: path } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: resolvedDescription,
      images: [{ url: OG_IMAGE_PATH, alt: OG_IMAGE_ALT }],
    },
  };
}

/**
 * The metadata for a page whose record didn't resolve, e.g., a Bioguide ID nobody holds.
 *
 * @param title - What wasn't found, e.g., `"Bill Not Found"`.
 * @returns Metadata naming the miss, marked `noindex` so a dead link never enters a search index.
 */
export function notFoundMetadata(title: string): Metadata {
  return {
    ...pageMetadata({ title, description: `This record could not be found in ${SITE_NAME}.` }),
    robots: { index: false, follow: true },
  };
}
