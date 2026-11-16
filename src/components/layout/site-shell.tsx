import type { JSX, ReactNode } from "react";

import { SiteHeader } from "@/components/layout/site-header";
import { SITE_NAME } from "@/lib/metadata";

/** The id the skip link targets. Also the `<main>` landmark's id, so the two can't drift apart. */
export const MAIN_CONTENT_ID: string = "main-content";

/** Props for {@link SiteShell}. */
type SiteShellProps = {
  /** The route's content, rendered inside the `<main>` landmark. */
  children: ReactNode;
};

/**
 * Shared page chrome wrapping every route's content. Not in `app/layout.tsx`, so the error and loading boundaries can
 * opt into it rather than inherit it.
 *
 * The skip link is the first focusable thing on every page, sparing keyboard readers the header's links on every route.
 * It's visually hidden until focused, then shown as a normal control.
 *
 * @param props - {@link SiteShellProps}.
 * @returns The skip link, the header, the main landmark, and the footer.
 */
export function SiteShell({ children }: SiteShellProps): JSX.Element {
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
        <span>{SITE_NAME}</span>
        <span>Built for understanding, anchored to primary sources.</span>
      </footer>
    </div>
  );
}
