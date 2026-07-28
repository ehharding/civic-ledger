import type { Metadata, Viewport } from "next";
import type { JSX, ReactNode } from "react";

import { getSiteUrl } from "@/lib/site";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Civic Ledger — Congress in Context",
    template: "%s — Civic Ledger",
  },
  description: "A source-conscious guide to the work of the United States Congress.",
  metadataBase: new URL(getSiteUrl()),
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
