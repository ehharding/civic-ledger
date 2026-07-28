import { formatDistanceToNow } from "date-fns";
import { Radio } from "lucide-react";
import type { JSX } from "react";

import type { CongressSnapshot } from "@/lib/congress/types";

/**
 * Banner that discloses whether the surrounding data is live Congress.gov data or preview fixtures.
 *
 * This is the single mechanism behind the project's central promise — that preview content is never mistakable for the
 * official record — so it takes `source` and `notice` as loose values rather than a whole `CongressSnapshot`. A caller
 * holding only a single bill lookup result can render an accurate banner without fetching a snapshot purely to satisfy
 * a type, which is what makes "always disclose" cheap enough to actually do everywhere.
 *
 * @param source - Whether the surrounding data is live or preview.
 * @param notice - Why preview data is being shown, when it is. Ignored for live data.
 * @param retrievedAt - When the data was fetched, if the caller has it.
 * @returns The disclosure banner, with a relative "Updated …" timestamp when one is available.
 */
export function DataSourceNotice({
  source,
  notice,
  retrievedAt,
}: {
  source: CongressSnapshot["source"];
  notice?: string;
  /**
   * Rendered as "Updated 5 minutes ago" — see `docs/decisions.md` on keeping source freshness visible in the interface.
   * Optional so callers without a timestamp handy still render correctly.
   */
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
