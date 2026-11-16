import type { Metadata, Viewport } from "next";
import type { JSX, ReactNode } from "react";

import { SiteAnalytics } from "@/components/layout/site-analytics";
import { SITE_DEFAULT_TITLE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE_TEMPLATE } from "@/lib/metadata";
import { getSiteUrl } from "@/lib/site";

import "./globals.css";

/**
 * The site-wide defaults, which double as the home page's metadata; every other route replaces them via `pageMetadata`.
 * Written by hand because {@link SITE_DEFAULT_TITLE} already names the site and the title template would repeat it.
 * `metadataBase` lets every page's canonical path stay root-relative.
 *
 * @see getSiteUrl
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
 * Whether the analytics scripts can load: they're served from `/_vercel/…`, which the static demo doesn't have. Read
 * here because only a server component can see `STATIC_EXPORT`.
 *
 * @see SiteAnalytics
 */
const isAnalyticsSupported: boolean = process.env.STATIC_EXPORT !== "true";

/** Props for {@link RootLayout}. */
type RootLayoutProps = Readonly<{
  /** The active route's rendered output. */
  children: ReactNode;
}>;

/**
 * Root HTML shell shared by every route. Page chrome lives in `SiteShell`; {@link SiteAnalytics} sits here so routes
 * without the chrome are still counted.
 *
 * @param props - {@link RootLayoutProps}.
 * @returns The document shell.
 */
export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="en">
      <body>
        {children}
        {isAnalyticsSupported ? <SiteAnalytics /> : null}
      </body>
    </html>
  );
}
