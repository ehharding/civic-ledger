/**
 * Covers the root layout's document shell and the site-wide metadata every route starts from.
 *
 * Rendered to a static string rather than into jsdom on purpose: this component *is* the `<html>` element, and mounting
 * it inside a container div is a DOM-nesting violation that says nothing about whether the shell is correct.
 *
 * The metadata assertions matter more than they look. The home page has no `metadata` export of its own, so what's here
 * is the home page's — and the Open Graph block is spelled out rather than inherited from nowhere. A refactor that
 * "simplified" it away would leave the site's own front door as the one page with no link preview.
 */
import type { Metadata } from "next";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SITE_DEFAULT_TITLE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE_TEMPLATE } from "@/lib/metadata";

const originalStaticExport: string | undefined = process.env.STATIC_EXPORT;

afterEach((): void => {
  if (originalStaticExport === undefined) delete process.env.STATIC_EXPORT;
  else process.env.STATIC_EXPORT = originalStaticExport;
  vi.resetModules();
});

/** Imports the layout fresh, so the module-level `STATIC_EXPORT` gate is evaluated against the current environment. */
async function loadLayout(): Promise<typeof import("@/app/layout")> {
  vi.resetModules();
  return import("@/app/layout");
}

describe("RootLayout", (): void => {
  beforeEach((): void => {
    delete process.env.STATIC_EXPORT;
  });

  it("renders an html element declaring the document language", async (): Promise<void> => {
    const { default: RootLayout } = await loadLayout();

    const markup: string = renderToStaticMarkup(
      <RootLayout>
        <p>Route output</p>
      </RootLayout>,
    );

    expect(markup).toContain('<html lang="en">');
    expect(markup).toContain("<body>");
  });

  it("renders the active route's output inside the body", async (): Promise<void> => {
    const { default: RootLayout } = await loadLayout();

    const markup: string = renderToStaticMarkup(
      <RootLayout>
        <p>Route output</p>
      </RootLayout>,
    );

    expect(markup).toContain("<p>Route output</p>");
  });

  it("stays bare, leaving page chrome to SiteShell", async (): Promise<void> => {
    const { default: RootLayout } = await loadLayout();

    const markup: string = renderToStaticMarkup(
      <RootLayout>
        <p>Route output</p>
      </RootLayout>,
    );

    // A route that opts out of the chrome should get a bare document, not a header it did not ask for.
    expect(markup).not.toContain("<header");
    expect(markup).not.toContain("<footer");
  });

  it("omits the analytics collectors in a static-export build, whose host cannot serve them", async (): Promise<void> => {
    process.env.STATIC_EXPORT = "true";
    const { default: RootLayout } = await loadLayout();

    const markup: string = renderToStaticMarkup(
      <RootLayout>
        <p>Route output</p>
      </RootLayout>,
    );

    // Both collectors load from `/_vercel/…`, a path only a Vercel deployment serves; on GitHub Pages they would be two
    // script tags resolving to that site's own 404 page on every route.
    expect(markup).not.toContain("_vercel");
  });
});

describe("layout metadata", (): void => {
  beforeEach((): void => {
    delete process.env.STATIC_EXPORT;
  });

  it("uses the site's own title as the default and the suffix template for everything else", async (): Promise<void> => {
    const { metadata }: { metadata: Metadata } = await loadLayout();

    expect(metadata.title).toEqual({ default: SITE_DEFAULT_TITLE, template: SITE_TITLE_TEMPLATE });
    // Run through the template it would read "Civic Ledger — Congress in Context — Civic Ledger", which is why the
    // default is written out rather than composed.
    expect(SITE_DEFAULT_TITLE).toContain(SITE_NAME);
  });

  it("declares a metadataBase, which is what lets every page's canonical path stay root-relative", async (): Promise<void> => {
    const { metadata }: { metadata: Metadata } = await loadLayout();

    expect(metadata.metadataBase).toBeInstanceOf(URL);
    expect(metadata.alternates?.canonical).toBe("/");
  });

  it("spells out the home page's own Open Graph and Twitter tags rather than inheriting from nowhere", async (): Promise<void> => {
    const { metadata }: { metadata: Metadata } = await loadLayout();

    expect(metadata.description).toBe(SITE_DESCRIPTION);
    expect(metadata.openGraph).toMatchObject({
      title: SITE_DEFAULT_TITLE,
      description: SITE_DESCRIPTION,
      siteName: SITE_NAME,
      type: "website",
      url: "/",
    });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: SITE_DEFAULT_TITLE });
  });
});

describe("layout viewport", (): void => {
  it("keeps browser chrome in step with whichever palette the media query resolved to", async (): Promise<void> => {
    const { viewport } = await loadLayout();

    expect(viewport.colorScheme).toBe("light dark");
    expect(viewport.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#f6f3ed" },
      { media: "(prefers-color-scheme: dark)", color: "#12181f" },
    ]);
  });
});
