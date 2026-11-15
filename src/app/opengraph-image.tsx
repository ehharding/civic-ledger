import { ImageResponse } from "next/og";

import { OG_IMAGE_ALT, OG_IMAGE_SIZE, SITE_DESCRIPTION, SITE_NAME } from "@/lib/metadata";

/**
 * The link-preview card every route shares; per-page `og:title` and `og:description` name the record. Drawn at build
 * time rather than stored as a binary. Colors are literal (Satori can't read CSS variables): the light-theme surface
 * and ink.
 */
// Required explicitly for `output: "export"`. That build writes an extensionless file, so GitHub Pages serves it
// without an `image/png` type and some scrapers skip it — acceptable for the demo.
export const dynamic = "force-static";

export const alt: string = OG_IMAGE_ALT;

/** Read from `metadata.ts` so the drawing and the `og:image:width`/`height` tags describing it cannot disagree. */
export const size: typeof OG_IMAGE_SIZE = OG_IMAGE_SIZE;

export const contentType: string = "image/png";

/**
 * Renders the shared Open Graph card with Satori-supported primitives and no web font, so the build needs no network.
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
