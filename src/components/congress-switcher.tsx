"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { ChangeEvent, JSX } from "react";

import type { CongressHistoryEntry } from "@/lib/congress/congress-history";
import { formatOrdinal } from "@/lib/format";

/**
 * Lets a person jump directly to any Congress this app supports browsing.
 *
 * Used identically on `/bills` (the current Congress) and `/bills/[congress]` (any other), so the control never needs
 * to know which route rendered it: it always navigates to `/bills/[congress]`, including for the current Congress,
 * which that route serves just as well as `/bills` does.
 *
 * @param congresses - Every Congress to offer, most recent first.
 *   @see listCongresses
 * @param selected - The Congress currently being viewed, so the control reflects it rather than resetting.
 * @returns The labeled Congress picker.
 */
export function CongressSwitcher({
  congresses,
  selected,
}: {
  /** Every Congress to offer, most recent first — see listCongresses. */
  congresses: CongressHistoryEntry[];
  /** The Congress currently being viewed, so the control reflects it correctly. */
  selected: number;
}): JSX.Element {
  const router = useRouter();

  /**
   * Navigates on selection. A `<select>` that needs a separate "Go" button to do anything is a needless second step.
   */
  function handleChange(event: ChangeEvent<HTMLSelectElement>): void {
    const nextCongress: string = event.target.value;
    router.push(`/bills/${nextCongress}` as Route);
  }

  return (
    <div className="congress-switcher">
      <label htmlFor="congress-switcher-select">Browsing</label>
      <select id="congress-switcher-select" onChange={handleChange} value={selected}>
        {congresses.map(
          (congress: CongressHistoryEntry): JSX.Element => (
            <option key={congress.number} value={congress.number}>
              {formatOrdinal(congress.number)} Congress · {congress.startYear}–{congress.endYear}
              {congress.isCurrent ? " (Current)" : ""}
            </option>
          ),
        )}
      </select>
    </div>
  );
}
