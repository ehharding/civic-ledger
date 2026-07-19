import { Radio } from "lucide-react";
import type { JSX } from "react";

import type { CongressSnapshot } from "@/lib/congress/types";

/** Banner that honestly discloses whether the surrounding data is live Congress.gov data or preview fixtures. */
export function DataSourceNotice({ snapshot }: { snapshot: CongressSnapshot }): JSX.Element {
  const isLive: boolean = snapshot.source === "live";

  return (
    <aside className={`source-notice source-notice--${snapshot.source}`} aria-live="polite">
      <Radio aria-hidden="true" size={16} />
      <span>
        <strong>{isLive ? "Live Congress.gov Data" : "Preview Data"}</strong>
        <span className="source-notice__copy">
          {isLive
            ? " Refreshed From the Official API Every Five Minutes."
            : ` ${snapshot.notice ?? "Add a Server-Only API Key To Use Live Records."}`}
        </span>
      </span>
    </aside>
  );
}
