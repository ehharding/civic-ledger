import type { Metadata } from "next";
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

/** Root HTML shell shared by every route. Page-level chrome (header/footer) lives in SiteShell, not here. */
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
