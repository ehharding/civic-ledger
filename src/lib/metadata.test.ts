/**
 * Covers the one thing `pageMetadata` exists to guarantee: that a page which names itself in a browser tab also names
 * itself in a link preview.
 *
 * That is not a property Next gives for free — `openGraph` is replaced wholesale by a child segment rather than merged
 * field by field, and no title template is applied to it — so every assertion here is guarding against a regression
 * that would be silent in the app and only visible in someone else's chat client.
 */
import { describe, expect, it } from "vitest";

import {
  notFoundMetadata,
  OG_IMAGE_SIZE,
  pageMetadata,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE_TEMPLATE,
} from "@/lib/metadata";

describe("pageMetadata", (): void => {
  it("carries the page's own title into the tab, and the site-suffixed one into the share tags", (): void => {
    const metadata = pageMetadata({ title: "Committees", description: "Every committee of Congress." });

    // The bare title, because the root layout's template appends the suffix to `<title>` on its own.
    expect(metadata.title).toBe("Committees");

    // The suffixed title, because that template is *not* applied to Open Graph or Twitter.
    expect(metadata.openGraph?.title).toBe(`Committees — ${SITE_NAME}`);
    expect(metadata.twitter?.title).toBe(`Committees — ${SITE_NAME}`);
  });

  it("keeps the title template and the composed social title spelling the suffix the same way", (): void => {
    expect(pageMetadata({ title: "Bills" }).openGraph?.title).toBe(SITE_TITLE_TEMPLATE.replace("%s", "Bills"));
  });

  it("repeats one description across all three surfaces, so no two can drift", (): void => {
    const description: string = "Every member currently seated in the House and Senate.";
    const metadata = pageMetadata({ title: "Members", description });

    expect(metadata.description).toBe(description);
    expect(metadata.openGraph?.description).toBe(description);
    expect(metadata.twitter?.description).toBe(description);
  });

  it("falls back to the site description rather than leaving a page undescribed", (): void => {
    const metadata = pageMetadata({ title: "Learn" });

    expect(metadata.description).toBe(SITE_DESCRIPTION);
    expect(metadata.openGraph?.description).toBe(SITE_DESCRIPTION);
  });

  it("declares the canonical URL and og:url from one path, so they cannot disagree", (): void => {
    const metadata = pageMetadata({ title: "HR 284", path: "/bills/119/hr/284" });

    expect(metadata.alternates?.canonical).toBe("/bills/119/hr/284");
    expect(metadata.openGraph?.url).toBe("/bills/119/hr/284");
  });

  it("omits both rather than inventing a canonical URL for a page that has no single one", (): void => {
    const metadata = pageMetadata({ title: "Bills" });

    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph?.url).toBeUndefined();
  });

  it("restates the card image on every page, since a page-level openGraph would otherwise drop it", (): void => {
    /*
     * The regression this guards is specific and easy to reintroduce: remove `images` here and the root layout's
     * file-convention image still attaches to the home page, so the tags look fine in the one place anyone spot-checks
     * while every bill, member, and committee link silently loses its card.
     */
    const metadata = pageMetadata({ title: "HR 284" });
    const [image] = [metadata.openGraph?.images].flat();

    expect(image).toMatchObject({ url: "/opengraph-image", ...OG_IMAGE_SIZE });
    expect([metadata.twitter?.images].flat()[0]).toMatchObject({ url: "/opengraph-image" });
  });

  it("asks for the large card, which is the shape the generated image is drawn at", (): void => {
    expect(pageMetadata({ title: "Bills" }).twitter).toMatchObject({ card: "summary_large_image" });
    expect(OG_IMAGE_SIZE).toEqual({ width: 1200, height: 630 });
  });
});

describe("notFoundMetadata", (): void => {
  it("keeps a dead link out of the index while still describing it", (): void => {
    const metadata = notFoundMetadata("Bill Not Found");

    expect(metadata.title).toBe("Bill Not Found");
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.description).toBeTruthy();
  });

  it("still names the site in its share tags, so even a miss reads as coming from here", (): void => {
    expect(notFoundMetadata("Member Not Found").openGraph?.title).toBe(`Member Not Found — ${SITE_NAME}`);
  });
});
