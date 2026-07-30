import { ImageResponse } from "next/og";

import { OG_IMAGE_ALT, OG_IMAGE_SIZE, SITE_DESCRIPTION, SITE_NAME } from "@/lib/metadata";

/**
 * The link-preview card every route shares.
 *
 * A root-level `opengraph-image` applies to the whole app, which is deliberate rather than a shortcut: the per-page
 * `og:title` and `og:description` already name the specific bill, member, or committee (@see pageMetadata), so what
 * the image has to add is recognition — that a link someone was handed leads *here* — not a second copy of the words
 * printed beside it.
 *
 * Drawn rather than served as a file so there is no binary asset in the repository to regenerate whenever the
 * wordmark or the palette moves, and so the card can't quietly fall out of step with them. It is rendered once at
 * build time for every prerendered route, so nothing here runs per request.
 *
 * The palette is stated literally rather than read from `tokens.css`: Satori resolves no CSS variables and no
 * stylesheet, and a card that silently lost its colors would be worse than one that repeats two hex values. These are
 * the light-theme surface and ink, matching the `themeColor` in the root layout.
 */
// Reads no request data, so it's safe to include in a STATIC_EXPORT=true build — required explicitly, on the same
// rule as sitemap.ts and robots.ts, because `output: "export"` won't infer it and fails the build outright without it.
//
// One caveat specific to that build: the export writes this as an extensionless `out/opengraph-image`, so GitHub Pages
// serves it without an `image/png` content type and some scrapers will skip the card. That affects the preview-only
// demo, not the primary deployment, and nothing else about either page depends on it.
export const dynamic = "force-static";

export const alt: string = OG_IMAGE_ALT;

/** Read from `metadata.ts` so the drawing and the `og:image:width`/`height` tags describing it cannot disagree. */
export const size = OG_IMAGE_SIZE;

export const contentType: string = "image/png";

/**
 * Renders the shared Open Graph card.
 *
 * Uses only the layout primitives Satori supports (flexbox, absolute positioning, solid fills) and no web font, so it
 * builds without a network fetch and cannot fail the build over an unreachable font CDN.
 *
 * @returns The 1200×630 PNG.
 */
export default function OpengraphImage(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        alignItems: "flex-start",
        background: "#f6f3ed",
        color: "#12181f",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        // Top-aligned rather than centered, so the accent rule anchors the card's top edge and the source line can sit
        // against the bottom on its own `marginTop: auto` — centering would fight both.
        justifyContent: "flex-start",
        padding: "76px 96px",
        width: "100%",
      }}
    >
      {/* The masthead rule: a single accent bar, the one piece of the site's chrome that reads at card size. */}
      <div style={{ background: "#8c5a2b", borderRadius: 4, height: 10, marginBottom: 56, width: 132 }} />
      <div style={{ display: "flex", fontSize: 82, fontWeight: 700, letterSpacing: -2 }}>{SITE_NAME}</div>
      <div style={{ color: "#4a5361", display: "flex", fontSize: 38, lineHeight: 1.35, marginTop: 28, maxWidth: 880 }}>
        {SITE_DESCRIPTION}
      </div>
      <div style={{ color: "#6b7482", display: "flex", fontSize: 26, marginTop: "auto" }}>
        Anchored to Primary Sources at congress.gov
      </div>
    </div>,
    size,
  );
}
