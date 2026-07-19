import type { Metadata } from "next";
import type { JSX } from "react";

import { BillDirectory } from "@/components/bill-directory";
import { PageHeader } from "@/components/page-header";
import { SiteShell } from "@/components/site-shell";
import { getCongressSnapshot } from "@/lib/congress/client";

export const metadata: Metadata = { title: "Bills" };

/**
 * A static export has no server to read a request URL from, so the shareable `?q=` deep link can't be honored
 * there — the directory still works, it just starts with an empty search.
 * In the normal server build, this reads the real query param.
 */
async function resolveInitialQuery(searchParams: Promise<{ q?: string }>): Promise<string> {
  if (process.env.STATIC_EXPORT === "true") return "";

  const { q } = await searchParams;
  return q ?? "";
}

/** Bill directory route: fetches the current snapshot server-side, then hands off to the interactive BillDirectory. */
export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<JSX.Element> {
  const [initialQuery, snapshot] = await Promise.all([resolveInitialQuery(searchParams), getCongressSnapshot()]);

  return (
    <SiteShell>
      <PageHeader
        eyebrow="Legislation"
        title="Start With the Record."
        description="Search the Current Feed, Then Follow Each Record Back to Its Official Congress.gov Source."
      />
      <BillDirectory bills={snapshot.bills} canLoadMore={snapshot.source === "live"} initialQuery={initialQuery} />
    </SiteShell>
  );
}
