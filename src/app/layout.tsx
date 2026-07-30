import type { Metadata, Viewport } from "next";
import type { JSX, ReactNode } from "react";

import { SITE_DEFAULT_TITLE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE_TEMPLATE } from "@/lib/metadata";
import { getSiteUrl } from "@/lib/site";

import "./globals.css";

/**
 * The site-wide defaults every route starts from.
 *
 * The home page has no `metadata` export of its own, so what's here *is* the home page's — which is why the Open Graph
 * and Twitter blocks are spelled out rather than left to be inherited from nowhere. Every other route replaces them
 * wholesale via `pageMetadata`, and that is what keeps a shared bill or member link describing that record instead of
 * describing the site. @see pageMetadata for why those tags have to be composed rather than derived from `title`.
 *
 * This one is written by hand rather than through that helper for one reason: {@link SITE_DEFAULT_TITLE} already names
 * the site, so running it through the title template would produce "Civic Ledger — Congress in Context — Civic Ledger".
 *
 * `metadataBase` is what lets the canonical and `og:url` paths every page declares stay root-relative, rather than each
 * one rebuilding the deployment's own origin. @see getSiteUrl
 */
export const metadata: Metadata = {
  title: {
    default: SITE_DEFAULT_TITLE,
    template: SITE_TITLE_TEMPLATE,
  },
  description: SITE_DESCRIPTION,
  metadataBase: new URL(getSiteUrl()),
  alternates: { canonical: "/" },
  openGraph: {
    title: SITE_DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
  },
};

/**
 * Light/dark mode itself is automatic (see the `prefers-color-scheme` overrides in src/styles/tokens.css) — this just
 * keeps the browser chrome (scrollbars, form controls, the mobile address bar) in sync with whichever palette that
 * media query resolved to, instead of defaulting to light.
 */
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ed" },
    { media: "(prefers-color-scheme: dark)", color: "#12181f" },
  ],
};

/**
 * Root HTML shell shared by every route.
 *
 * Deliberately bare: page chrome lives in `SiteShell`, so routes that shouldn't have it (or that render before it can
 * be resolved) aren't forced to.
 *
 * @param children - The active route's rendered output.
 * @returns The document shell.
 */
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
