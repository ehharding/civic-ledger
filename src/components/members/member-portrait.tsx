import type { JSX } from "react";

import type { MemberDepiction } from "@/lib/congress/members/model";

/** The class names and intrinsic size each place a portrait appears in draws it with. */
const VARIANTS = {
  card: {
    figure: "member-card__portrait",
    image: "member-card__portrait-image",
    credit: "member-card__portrait-credit",
    width: 88,
    height: 110,
  },
  profile: {
    figure: "member-portrait",
    image: "member-portrait__image",
    credit: "member-portrait__credit",
    width: 220,
    height: 275,
  },
} as const;

/**
 * A member's official portrait, with the credit line Congress.gov's terms require beside it.
 *
 * Shared by the directory card and the member's own page, so the one place this app injects Congress.gov's credit HTML
 * is written once.
 *
 * A plain `<img>` rather than `next/image`, deliberately: `next/image` would need every congress.gov portrait host
 * allow-listed in `next.config.ts`, where an un-listed host is a hard runtime error rather than a missing picture — the
 * opposite of how the rest of this app degrades — and the static export disables optimization anyway. `loading="lazy"`
 * matters most in the directory: several hundred cards, of which a reader sees a dozen, so the rest are never fetched
 * until they are scrolled to.
 *
 * The credit is rendered rather than omitted for space. It is the condition on showing the image at all, and a grid is
 * exactly where it would be tempting to drop — several hundred identical "Image courtesy of the Member" lines look like
 * noise right up until the one that says something else. It is styled small and quiet, not hidden: a credit only
 * sighted readers cannot see is not a credit.
 *
 * @param depiction - The portrait and its credit, as the adapter mapped them.
 * @param alt - The image's alternative text. Empty on a card, where the member's name is the very next thing and the
 *   link, so describing the image would announce the same person twice; descriptive on the member's page, where the
 *   portrait is the only place the person is depicted.
 * @param variant - Which surface is drawing it, which decides its class names and size.
 * @returns The portrait and its credit, or `null` when Congress.gov publishes no image for this member — which is every
 *   preview placeholder, a small number of live records, and many members who left before the photo collection was
 *   digitized.
 */
export function MemberPortrait({
  depiction,
  alt,
  variant,
}: {
  depiction: MemberDepiction | undefined;
  alt: string;
  variant: keyof typeof VARIANTS;
}): JSX.Element | null {
  if (!depiction) return null;

  const classes: (typeof VARIANTS)[keyof typeof VARIANTS] = VARIANTS[variant];

  return (
    <figure className={classes.figure}>
      {/* biome-ignore lint/performance/noImgElement: see the note on next/image above. */}
      <img
        alt={alt}
        className={classes.image}
        height={classes.height}
        loading="lazy"
        src={depiction.imageUrl}
        width={classes.width}
      />
      {depiction.attribution ? (
        <figcaption className={classes.credit}>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by sanitizeSummaryHtml in the adapter. */}
          <span dangerouslySetInnerHTML={{ __html: depiction.attribution }} />
        </figcaption>
      ) : null}
    </figure>
  );
}
