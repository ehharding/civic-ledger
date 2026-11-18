import { formatDistanceToNow } from "date-fns";
import { Radio } from "lucide-react";
import type { JSX } from "react";

import type { CongressSnapshot } from "@/lib/congress/bills/model";

/** Props for {@link DataSourceNotice}. */
type DataSourceNoticeProps = {
  /** Whether the surrounding data is live or preview. */
  source: CongressSnapshot["source"];
  /**
   * Why preview data is being shown, when it is — or, on live data, what the read is missing (a roster that arrived
   * short of Congress.gov's own count). Live data with no notice says only where it came from.
   */
  notice?: string;
  /**
   * When the data was fetched, rendered as "Updated 5 minutes ago" — `docs/data-policy.md` requires freshness to be
   * visible, not merely computed. Optional for callers without a timestamp.
   */
  retrievedAt?: string;
};

/**
 * Banner that discloses whether the surrounding data is live Congress.gov data or preview fixtures.
 *
 * This is the single mechanism behind the project's central promise — that preview content is never mistakable for the
 * official record — so it takes `source` and `notice` as loose values rather than a whole `CongressSnapshot`. A caller
 * holding only a single bill lookup result can render an accurate banner without fetching a snapshot purely to satisfy
 * a type, which is what makes "always disclose" cheap enough to actually do everywhere.
 *
 * @param props - {@link DataSourceNoticeProps}.
 * @returns The disclosure banner, with a relative "Updated …" timestamp when one is available.
 */
export function DataSourceNotice({ source, notice, retrievedAt }: DataSourceNoticeProps): JSX.Element {
  const isLive: boolean = source === "live";
  const updated: string | undefined = retrievedAt
    ? formatDistanceToNow(new Date(retrievedAt), { addSuffix: true })
    : undefined;

  return (
    // Not a live region: this renders with the page and never updates in place, and an aria-live container that is
    // present at load makes some screen readers announce it out of order, ahead of the heading it belongs to. A route
    // change remounts it, which assistive technology already reports as a new page.
    <aside aria-label="Data source" className={`source-notice source-notice--${source}`}>
      <Radio aria-hidden="true" size={16} />
      <span>
        <strong>{isLive ? "Live Congress.gov Data" : "Preview Data"}</strong>
        <span className="source-notice__copy">
          {isLive
            ? ` Refreshed from the official API every five minutes.${notice ? ` ${notice}` : ""}`
            : ` ${notice ?? "Add a server-only API key to use live records."}`}
        </span>
        {updated ? (
          // The exact wording ("5 minutes ago") depends on the gap between when this rendered on the server and when
          // React hydrates on the client, which can legitimately differ by a second or two — that's expected drift for
          // a relative-time string, not a real markup mismatch.
          <span className="source-notice__updated" suppressHydrationWarning>
            {" "}
            Updated {updated}.
          </span>
        ) : null}
      </span>
    </aside>
  );
}
