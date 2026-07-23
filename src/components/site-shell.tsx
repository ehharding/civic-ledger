import type { JSX, ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";

/** Shared page chrome (header + footer) wrapping every route's content. */
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
