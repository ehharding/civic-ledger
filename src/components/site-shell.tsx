import type { JSX, ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";

/** The id the skip link targets. Also the `<main>` landmark's id, so the two can't drift apart. */
export const MAIN_CONTENT_ID: string = "main-content";

/**
 * Shared page chrome wrapping every route's content.
 *
 * Lives here rather than in `app/layout.tsx` so the root layout stays a bare HTML document — that keeps the error and
 * loading boundaries free to opt into the chrome (they do) or render without it, instead of inheriting it unavoidably.
 *
 * The skip link is the first focusable thing on every page. Without it, reaching the content by keyboard means tabbing
 * past the wordmark, three navigation links, and the search box on every single route — and on the home page, then
 * arriving at a chamber diagram of several hundred seats. It's visually hidden until focused, at which point it becomes
 * a normal visible control (a skip link nobody can see is a skip link nobody can use).
 *
 * @param children - The route's content, rendered inside the `<main>` landmark.
 * @returns The skip link, the header, the main landmark, and the footer.
 */
export function SiteShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="site-frame">
      <a className="skip-link" href={`#${MAIN_CONTENT_ID}`}>
        Skip to Main Content
      </a>
      <SiteHeader />
      {/* tabIndex={-1} so the skip link's target can actually receive focus; without it some browsers move the viewport
          but leave focus where it was, and the next Tab lands back in the header. */}
      <main className="page-shell" id={MAIN_CONTENT_ID} tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <span>Civic Ledger</span>
        <span>Built for understanding, anchored to primary sources.</span>
      </footer>
    </div>
  );
}
