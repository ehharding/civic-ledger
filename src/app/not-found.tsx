import Link from "next/link";
import type { JSX } from "react";

import { SiteShell } from "@/components/site-shell";

/** Rendered for any unmatched route, and for a bill lookup that resolves to no record (see notFound() in the bill detail page). */
export default function NotFound(): JSX.Element {
  return (
    <SiteShell>
      <section className="empty-state">
        <p className="eyebrow">Not Found</p>
        <h1>That Record Is Not in This Draft.</h1>
        <p>Try the Current Bill Directory or Return to the Overview.</p>
        <Link href="/bills" className="button button--primary">
          Browse Bills
        </Link>
      </section>
    </SiteShell>
  );
}
