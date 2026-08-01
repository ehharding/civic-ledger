import type { Metadata } from "next";

/**
 * How a page describes itself to everything outside the browser tab: search results, and the link previews that social
 * platforms, chat clients, and messaging apps build from Open Graph and Twitter card tags.
 *
 * This exists because Next does *not* derive those tags from `title` and `description` on its own. A page that sets
 * only those two gets a correct `<title>` and a correct `<meta name="description">`, and then a link preview carrying
 * the root layout's site-wide wording — so every bill, member, and committee in the app shared as the same generic
 * card, naming none of them. That matters more here than on most sites: this app's whole premise is that a
 * congressional record is a thing worth handing to someone else, and the moment of handing it over is exactly the
 * moment the page stopped describing itself.
 *
 * So the rule is one call per page, and the tags are composed rather than inherited. @see pageMetadata
 */

/** The site's name, as it appears in a title suffix and as the `og:site_name` of every page. */
export const SITE_NAME: string = "Civic Ledger";

/** The home page's own title. Used verbatim rather than run through {@link SITE_TITLE_TEMPLATE}. */
export const SITE_DEFAULT_TITLE: string = `${SITE_NAME} — Congress in Context`;

/**
 * The suffix every other page's title carries, so a tab and a share card can't disagree about what site a page is on.
 * Declared as a template for `metadata.title` and applied by hand in {@link pageMetadata}, since Next applies a title
 * template to `title` but not to `openGraph.title`.
 */
export const SITE_TITLE_TEMPLATE: string = `%s — ${SITE_NAME}`;

/** The site-wide description, and the fallback for any page that doesn't have a more specific one of its own. */
export const SITE_DESCRIPTION: string = "A source-conscious guide to the work of the United States Congress.";

/**
 * The shared link-preview card, declared here rather than left to Next's file convention to attach on its own.
 *
 * That convention does attach it — but only to a segment that hasn't declared an `openGraph` of its own. `openGraph` is
 * replaced wholesale by a child segment rather than merged field by field, so the moment a page names itself through
 * {@link pageMetadata} it also drops the image the root layout had picked up. Restating it here is what keeps every
 * page's card *and* its title correct, instead of forcing a choice between them.
 *
 * The dimensions are the ones every major platform crops toward; `src/app/opengraph-image.tsx` reads them from here so
 * the drawing and the tag describing it cannot disagree.
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
  /** One sentence describing this page specifically. Falls back to {@link SITE_DESCRIPTION} when a page has no more
   * specific line than the site's own. */
  description?: string;
  /**
   * The page's canonical path, root-relative and leading-slash-first (`"/bills"`, `"/members/L000174"`). Resolved
   * against `metadataBase` in the root layout. Omit it only where a single canonical path genuinely doesn't exist.
   */
  path?: string;
};

/**
 * Builds one page's full metadata: the tab title, the search-result description, the canonical URL, and the Open Graph
 * and Twitter card tags that a shared link renders from.
 *
 * The Open Graph title is composed here with the site suffix rather than left to `metadata.title`'s template, because
 * that template applies to the `<title>` element alone — an `openGraph.title` set to a bare page title reaches a link
 * preview as a bare page title, with nothing saying which site it came from.
 *
 * `og:type` is `"website"` throughout, deliberately. `"article"` is the tempting choice for a bill or member page, but
 * it implies an authored piece with a byline and a publication date, and these pages are neither: they are views onto a
 * public record this app didn't write.
 * @see docs/data-policy.md, "The Source of Truth Stays Upstream".
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
 * The metadata for a page whose record didn't resolve — a bill number that names nothing, a Bioguide ID nobody holds.
 *
 * Kept here beside {@link pageMetadata} so a 404's tags are as deliberate as any other page's, and so no route has to
 * remember on its own that a missing record still gets a description and still tells a crawler not to index it.
 *
 * @param title - What wasn't found, e.g., `"Bill Not Found"`.
 * @returns Metadata naming the miss, marked `noindex` so a dead link never enters a search index.
 */
export function notFoundMetadata(title: string): Metadata {
  return {
    ...pageMetadata({ title, description: "This record could not be found in Civic Ledger." }),
    robots: { index: false, follow: true },
  };
}
