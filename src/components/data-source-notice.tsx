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
}: {
  source: CongressSnapshot["source"];
  notice?: string;
}): JSX.Element {
  const isLive: boolean = source === "live";

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
      </span>
    </aside>
  );
}
