import { formatDistanceToNow } from "date-fns";
import { Radio } from "lucide-react";
import type { JSX } from "react";

import type { DataSource } from "@/lib/congress/types";

/**
 * How each provenance names itself, and what it says about itself when it has nothing more specific to say.
 *
 * The three headings are written to be distinguishable at a glance rather than merely accurate, because this banner is
 * the single mechanism behind the project's central promise. "Stored" in particular has to read as *neither* of its
 * neighbors: a reader who skims it as "Live" has been misled about currency, and one who skims it as "Preview" has been
 * misled about whether the records in front of them are real. @see DataSource.
 */
const SOURCE_HEADINGS: Record<DataSource, string> = {
  live: "Live Congress.gov Data",
  stored: "Stored Congress.gov Records",
  preview: "Preview Data",
};

/**
 * The copy used when the caller supplies no `notice` of its own. Live never needs one; the other two normally have one.
 */
const SOURCE_FALLBACK_COPY: Record<DataSource, string> = {
  live: "Refreshed from the official API every five minutes.",
  stored: "Real records this app read from Congress.gov earlier, shown because it cannot be reached right now.",
  preview: "Add a server-only API key to use live records.",
};

/**
 * Banner that discloses where the surrounding data came from: live Congress.gov, this app's stored copy, or preview
 * fixtures.
 *
 * This is the single mechanism behind the project's central promise — that preview content is never mistakable for the
 * official record, and now that a stored copy is never mistakable for a current one — so it takes `source` and `notice`
 * as loose values rather than a whole `CongressSnapshot`. A caller holding only a single bill lookup result can render
 * an accurate banner without fetching a snapshot purely to satisfy a type, which is what makes "always disclose" cheap
 * enough to actually do everywhere.
 *
 * @param source - Where the surrounding data came from.
 * @param notice - Why something other than live data is being shown. Ignored for live data.
 * @param retrievedAt - When the data was fetched, if the caller has it.
 * @returns The disclosure banner, with a relative "Updated …" timestamp when one is available.
 */
export function DataSourceNotice({
  source,
  notice,
  retrievedAt,
}: {
  source: DataSource;
  notice?: string;
  /**
   * Rendered as "Updated 5 minutes ago" — `docs/data-policy.md` requires source freshness to be visible in the
   * interface rather than merely computed, and this is the field that keeps that promise. Optional so callers without a
   * timestamp handy still render correctly.
   */
  retrievedAt?: string;
}): JSX.Element {
  const updated: string | undefined = retrievedAt
    ? formatDistanceToNow(new Date(retrievedAt), { addSuffix: true })
    : undefined;
  // A caller-supplied notice wins except on the live path, where there is nothing more specific to say than the caching
  // policy and a passed-through notice would only ever be a leftover from a previous provenance.
  const copy: string = source === "live" ? SOURCE_FALLBACK_COPY.live : (notice ?? SOURCE_FALLBACK_COPY[source]);

  return (
    // Not a live region: this renders with the page and never updates in place, and an aria-live container that is
    // present at load makes some screen readers announce it out of order, ahead of the heading it belongs to. A route
    // change remounts it, which assistive technology already reports as a new page.
    <aside aria-label="Data source" className={`source-notice source-notice--${source}`}>
      <Radio aria-hidden="true" size={16} />
      <span>
        <strong>{SOURCE_HEADINGS[source]}</strong>
        <span className="source-notice__copy"> {copy}</span>
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
