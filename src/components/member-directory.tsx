"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { type ChangeEvent, type JSX, useMemo, useState } from "react";

import { MemberCard } from "@/components/member-card";
import {
  ANY_FACET,
  type ChamberFilter,
  filterMembers,
  hasActiveMemberFilters,
  listMemberParties,
  listMemberStates,
  type MemberFilters,
  NO_MEMBER_FILTERS,
  type PartyFilter,
} from "@/lib/congress/member-filter";
import {
  type CongressChamber,
  chamberShortLabels,
  congressChambers,
  type MemberDirectoryEntry,
  type PartyGroup,
  partyGroupLabels,
} from "@/lib/congress/members";
import type { CongressSnapshot } from "@/lib/congress/types";
import { formatOrdinal } from "@/lib/format";

/** The chamber control's options: both chambers, preceded by the "no filter" choice. */
const CHAMBER_OPTIONS: readonly ChamberFilter[] = [ANY_FACET, ...congressChambers];

/** Props for {@link MemberDirectory}. */
type MemberDirectoryProps = {
  /** The complete roster, already ordered server-side. */
  members: MemberDirectoryEntry[];
  /** The Congress this roster describes, named in the scope note. */
  congress: number;
  /** Whether these are live Congress.gov records or labeled placeholders. Changes the scope note's claim. */
  source: CongressSnapshot["source"];
};

/**
 * Browsable directory of everyone serving in a Congress.
 *
 * Every narrowing here happens in the browser against the roster the server already sent — no request per keystroke, no
 * debounce, no loading state, and nothing to go wrong offline or in the static export. That is possible because a
 * Congress is a bounded list of a few hundred people; the bill directory cannot work this way, and its very different
 * shape (debounced fetches to a server-side sweep) is a consequence of that, not a difference in taste.
 * @see filterMembers for the rules themselves.
 *
 * @param props - @see MemberDirectoryProps
 * @returns The search and facet controls, the result count and scope note, and the member grid or an empty state.
 */
export function MemberDirectory({ members, congress, source }: MemberDirectoryProps): JSX.Element {
  const [filters, setFilters] = useState<MemberFilters>(NO_MEMBER_FILTERS);

  // Both option lists are derived from the whole roster rather than from the filtered result, so choosing a party
  // doesn't empty the state list out from under the reader mid-narrowing.
  const states: string[] = useMemo((): string[] => listMemberStates(members), [members]);
  const parties: PartyGroup[] = useMemo((): PartyGroup[] => listMemberParties(members), [members]);

  const shown: MemberDirectoryEntry[] = useMemo(
    (): MemberDirectoryEntry[] => filterMembers(members, filters),
    [members, filters],
  );

  const isFiltered: boolean = hasActiveMemberFilters(filters);
  const countLabel: string = isFiltered
    ? `${shown.length} of ${members.length} ${members.length === 1 ? "Member" : "Members"}`
    : `${members.length} ${members.length === 1 ? "Member" : "Members"}`;

  const scopeNote: string =
    source === "live"
      ? `Everyone holding a seat in the ${formatOrdinal(congress)} Congress as Congress.gov currently reports it. Vacant seats are simply absent.`
      : "Placeholder people, shown until a Congress.gov API key is configured. Some no longer hold a seat.";

  /** Applies one facet without disturbing the others. */
  function update(patch: Partial<MemberFilters>): void {
    setFilters((current: MemberFilters): MemberFilters => ({ ...current, ...patch }));
  }

  return (
    <section className="member-directory" aria-label="Member directory">
      <div className="directory-controls">
        <div className="directory-search">
          <Search aria-hidden="true" size={18} />
          <label className="sr-only" htmlFor="member-directory-search">
            Search members by name or the place they represent
          </label>
          <input
            id="member-directory-search"
            onChange={(event: ChangeEvent<HTMLInputElement, HTMLInputElement>): void =>
              update({ query: event.target.value })
            }
            placeholder="Search by name or place"
            type="search"
            value={filters.query}
          />
        </div>

        <fieldset className="stage-filters">
          <legend className="sr-only">Filter by chamber</legend>
          <SlidersHorizontal aria-hidden="true" size={15} />
          {CHAMBER_OPTIONS.map(
            (option: ChamberFilter): JSX.Element => (
              <button
                aria-pressed={filters.chamber === option}
                className={filters.chamber === option ? "is-active" : ""}
                key={option}
                onClick={(): void => update({ chamber: option })}
                type="button"
              >
                {option === ANY_FACET ? "Both Chambers" : chamberShortLabels[option as CongressChamber]}
              </button>
            ),
          )}
        </fieldset>
      </div>

      <div className="member-facets">
        <div className="member-facet">
          <label htmlFor="member-party-filter">Party</label>
          <select
            id="member-party-filter"
            onChange={(event: ChangeEvent<HTMLSelectElement>): void =>
              update({ party: event.target.value as PartyFilter })
            }
            value={filters.party}
          >
            <option value={ANY_FACET}>All parties</option>
            {parties.map(
              (party: PartyGroup): JSX.Element => (
                <option key={party} value={party}>
                  {partyGroupLabels[party]}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="member-facet">
          <label htmlFor="member-state-filter">State or territory</label>
          <select
            id="member-state-filter"
            onChange={(event: ChangeEvent<HTMLSelectElement>): void => update({ state: event.target.value })}
            value={filters.state}
          >
            <option value={ANY_FACET}>All states and territories</option>
            {states.map(
              (state: string): JSX.Element => (
                <option key={state} value={state}>
                  {state}
                </option>
              ),
            )}
          </select>
        </div>

        {isFiltered ? (
          <button
            className="button button--quiet member-facets__clear"
            onClick={(): void => setFilters(NO_MEMBER_FILTERS)}
            type="button"
          >
            Clear Filters
          </button>
        ) : null}
      </div>

      <p className="directory-result-count" aria-live="polite">
        {countLabel}
      </p>
      <p className="directory-search-note">{scopeNote}</p>

      {shown.length > 0 ? (
        <div className="member-grid">
          {shown.map(
            (entry: MemberDirectoryEntry): JSX.Element => (
              <MemberCard entry={entry} key={entry.bioguideId} />
            ),
          )}
        </div>
      ) : (
        <div className="no-results">
          <h2>No Members Match Those Filters.</h2>
          <p>Try a shorter name, a different chamber, or clear the filters to start again.</p>
        </div>
      )}
    </section>
  );
}
