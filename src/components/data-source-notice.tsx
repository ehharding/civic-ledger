import { formatDistanceToNow } from "date-fns";
import { Radio } from "lucide-react";
import type { JSX } from "react";

import type { CongressSnapshot } from "@/lib/congress/types";

/**
 * Banner that honestly discloses whether the surrounding data is live Congress.gov data or preview fixtures.
 * Takes `source`/`notice` directly (rather than a full CongressSnapshot) so callers that only have a single bill lookup
 * result — not a whole snapshot — can render it without fetching one just for this.
 */
export function DataSourceNotice({
  source,
  notice,
  retrievedAt,
}: {
  source: CongressSnapshot["source"];
  notice?: string;
  /** When this data was actually fetched, if the caller has it. Rendered as "Updated 5 minutes ago" — see
   * docs/decisions.md's note on keeping source freshness visible in the interface. Optional so existing callers that
   * don't have a timestamp handy (or tests exercising the banner in isolation) still render correctly. */
  retrievedAt?: string;
}): JSX.Element {
  const isLive: boolean = source === "live";
  const updated: string | undefined = retrievedAt
    ? formatDistanceToNow(new Date(retrievedAt), { addSuffix: true })
    : undefined;

  return (
    <aside className={`source-notice source-notice--${source}`} aria-live="polite">
      <Radio aria-hidden="true" size={16} />
      <span>
        <strong>{isLive ? "Live Congress.gov Data" : "Preview Data"}</strong>
        <span className="source-notice__copy">
          {isLive
            ? " Refreshed from the official API every five minutes."
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
