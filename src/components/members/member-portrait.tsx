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

/** Props for {@link MemberPortrait}. */
type MemberPortraitProps = {
  /** The portrait and its credit, as the adapter mapped them. */
  depiction: MemberDepiction | undefined;
  /** Alternative text: empty on a card (the name follows), descriptive on the member page. */
  alt: string;
  /** Which surface is drawing it, which decides its class names and size. */
  variant: keyof typeof VARIANTS;
};

/**
 * A member's official portrait with the credit line Congress.gov's terms require — always rendered (small, not hidden),
 * since it's the condition for showing the image. Shared by the directory card and the member page.
 *
 * A plain lazy `<img>` rather than `next/image`, which would hard-error on any un-allow-listed portrait host, and the
 * static export disables optimization anyway.
 *
 * @param props - {@link MemberPortraitProps}.
 * @returns The portrait and its credit, or `null` when there's no image (every preview placeholder, and some records).
 */
export function MemberPortrait({ depiction, alt, variant }: MemberPortraitProps): JSX.Element | null {
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
