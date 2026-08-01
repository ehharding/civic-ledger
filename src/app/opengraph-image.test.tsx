/**
 * Covers the shared Open Graph card.
 *
 * The card is *constructed* here but deliberately not rasterized: `ImageResponse` hands its SVG to a native/WASM
 * rasterizer that isn't available under jsdom, and pulling one in would mean this suite maintained an image pipeline to
 * assert on pixels nobody reads. What is checkable — and what actually breaks — is everything around the drawing: that
 * the route declares the content type and size the `og:image` tags advertise, that those numbers come from the same
 * constant `pageMetadata` reads rather than a second copy, and that the card composes without Satori rejecting a style
 * it can't lay out. That last one is the real regression risk: Satori supports a subset of CSS, and a `display` or
 * `gap` it doesn't implement fails at build time, not at review time.
 */
import { describe, expect, it } from "vitest";

import OpengraphImage, { alt, contentType, dynamic, size } from "@/app/opengraph-image";
import { OG_IMAGE_ALT, OG_IMAGE_SIZE } from "@/lib/metadata";

describe("opengraph-image", (): void => {
  it("declares the size and alt text from the same constants the meta tags are built from", (): void => {
    // Two copies of "1200×630" is exactly how a card ends up rendering at one size while its tags claim another.
    expect(size).toBe(OG_IMAGE_SIZE);
    expect(alt).toBe(OG_IMAGE_ALT);
    expect(contentType).toBe("image/png");
  });

  it("is force-static, which a STATIC_EXPORT build requires and will not infer", (): void => {
    expect(dynamic).toBe("force-static");
  });

  it("composes into a response carrying the declared content type", (): void => {
    const response: Response = OpengraphImage();

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("uses only layout Satori can resolve, so the card cannot fail a build", (): void => {
    // Constructing the response is what runs the element tree through Satori's layout pass — an unsupported property or
    // a missing `display: flex` on a node with children is rejected there, not at render time.
    expect((): Response => OpengraphImage()).not.toThrow();
  });
});
