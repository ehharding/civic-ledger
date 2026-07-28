import Link from "next/link";
import type { JSX } from "react";

import { SiteShell } from "@/components/site-shell";

/**
 * Rendered for any unmatched route, and for a bill lookup that resolved to no record.
 *
 * @returns The not-found page, with a route back into the bill directory rather than a dead end.
 * @see BillPage, which calls `notFound()` when a bill can't be resolved.
 */
export default function NotFound(): JSX.Element {
  return (
    <SiteShell>
      <section className="empty-state">
        <p className="eyebrow">Not Found</p>
        <h1>That Record Is Not in This Draft.</h1>
        <p>Try the current bill directory or return to the overview.</p>
        <Link href="/bills" className="button button--primary">
          Browse Bills
        </Link>
      </section>
    </SiteShell>
  );
}
