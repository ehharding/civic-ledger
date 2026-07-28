import type { JSX, ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";

/**
 * Shared page chrome wrapping every route's content.
 *
 * Lives here rather than in `app/layout.tsx` so the root layout stays a bare HTML document — that keeps the error and
 * loading boundaries free to opt into the chrome (they do) or render without it, instead of inheriting it unavoidably.
 *
 * @param children - The route's content, rendered inside the `<main>` landmark.
 * @returns The header, the main landmark, and the footer.
 */
export function SiteShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="site-frame">
      <SiteHeader />
      <main className="page-shell">{children}</main>
      <footer className="site-footer">
        <span>Civic Ledger</span>
        <span>Built for understanding, anchored to primary sources.</span>
      </footer>
    </div>
  );
}
