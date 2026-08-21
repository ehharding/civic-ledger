"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent, JSX } from "react";

import type { CongressHistoryEntry } from "@/lib/congress/congress-history";
import { formatOrdinal } from "@/lib/format";
import { congressBillsHref } from "@/lib/routes";

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
   *
   * Changing a control's value to cause navigation is the pattern WCAG 3.2.2 (On Input) cautions about, and its stated
   * exception is that the behavior be advised *before* the control is used — which is what the label's hint and the
   * `aria-describedby` note do. The guard against re-navigating to the Congress already showing matters for the same
   * reason: on browsers where arrowing through a `<select>` fires `change` per option, it keeps a keyboard user from
   * bouncing through pages they never chose.
   */
  function handleChange(event: ChangeEvent<HTMLSelectElement>): void {
    const nextCongress: string = event.target.value;
    if (Number(nextCongress) === selected) return;

    router.push(congressBillsHref(nextCongress));
  }

  return (
    <div className="congress-switcher">
      <label htmlFor="congress-switcher-select">
        Browsing <span className="congress-switcher__hint">(selecting a Congress opens it)</span>
      </label>
      <select
        aria-describedby="congress-switcher-hint"
        id="congress-switcher-select"
        onChange={handleChange}
        value={selected}
      >
        {congresses.map(
          (congress: CongressHistoryEntry): JSX.Element => (
            <option key={congress.number} value={congress.number}>
              {formatOrdinal(congress.number)} Congress · {congress.startYear}–{congress.endYear}
              {congress.isCurrent ? " (Current)" : ""}
            </option>
          ),
        )}
      </select>
      <p className="sr-only" id="congress-switcher-hint">
        Choosing a Congress from this list opens that Congress&rsquo;s bill directory.
      </p>
    </div>
  );
}
