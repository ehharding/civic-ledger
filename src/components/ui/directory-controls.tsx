import { ArrowDownUp, Search, SlidersHorizontal, X } from "lucide-react";
import type { ChangeEvent, JSX, ReactNode } from "react";

import { ANY_FACET, type FacetOption } from "@/lib/congress/directory-filter";
import { pluralize } from "@/lib/format";

/**
 * The controls the bill, member, and committee directories are built from — search, segmented filter, facets, sort,
 * "Clear Filters", and the result count — shared so the three directories behave identically. None of them knows what a
 * stage, chamber, or committee type is: each renders the options and labels it's handed and reports what was picked.
 */

/** Props for {@link DirectorySearch}. */
type DirectorySearchProps = {
  /** The input's `id`, which ties it to its label. Must be unique within the page. */
  id: string;
  /** The visually hidden label, fuller than the placeholder, which disappears once someone types. */
  label: string;
  /** The placeholder shown in the empty field. */
  placeholder: string;
  /** The current query. */
  value: string;
  /** Called with the new query on every keystroke — debouncing, if any, belongs to the caller. */
  onChange: (value: string) => void;
};

/**
 * A directory's search field. `type="search"` gets the browser's clear button and a search key on touch keyboards.
 *
 * @param props - {@link DirectorySearchProps}.
 * @returns The labeled search field with its leading icon.
 */
export function DirectorySearch({ id, label, placeholder, value, onChange }: DirectorySearchProps): JSX.Element {
  return (
    <div className="directory-search">
      <Search aria-hidden="true" size={18} />
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        onChange={(event: ChangeEvent<HTMLInputElement, HTMLInputElement>): void => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </div>
  );
}

/** Props for {@link SegmentedFilter}. */
type SegmentedFilterProps<T extends string> = {
  /** The visually hidden `<legend>` naming what this filters, e.g., "Filter by legislative stage". */
  legend: string;
  /** Every choice, in the order they should read. Include the "no filter" option — this doesn't add one. */
  options: readonly T[];
  /** Which option is currently applied. */
  selected: T;
  /** Called with the option that was picked. */
  onSelect: (option: T) => void;
  /** The visible text for an option. Kept a function so each directory can label its own domain's values. */
  labelFor: (option: T) => string;
};

/**
 * A row of mutually exclusive filter buttons. A `<fieldset>` and hidden `<legend>` tell a screen reader what the group
 * filters; `aria-pressed` (not tabs) because nothing here reveals a panel.
 *
 * @param props - {@link SegmentedFilterProps}.
 * @returns The filter group.
 */
export function SegmentedFilter<T extends string>({
  legend,
  options,
  selected,
  onSelect,
  labelFor,
}: SegmentedFilterProps<T>): JSX.Element {
  return (
    <fieldset className="segmented-filter">
      <legend className="sr-only">{legend}</legend>
      <SlidersHorizontal aria-hidden="true" size={15} />
      {options.map(
        (option: T): JSX.Element => (
          <button
            aria-pressed={selected === option}
            className={selected === option ? "is-active" : ""}
            key={option}
            onClick={(): void => onSelect(option)}
            type="button"
          >
            {labelFor(option)}
          </button>
        ),
      )}
    </fieldset>
  );
}

/** Props for {@link FacetOptions}. */
type FacetOptionsProps<Value extends string> = {
  /** The values to offer, already ordered and counted. */
  options: readonly FacetOption<Value>[];
};

/**
 * A facet dropdown's `<option>` list, each labeled with its count.
 *
 * @param props - {@link FacetOptionsProps}.
 * @returns One `<option>` per value.
 * @see FacetOption
 */
export function FacetOptions<Value extends string>({ options }: FacetOptionsProps<Value>): JSX.Element {
  return (
    <>
      {options.map(
        (option: FacetOption<Value>): JSX.Element => (
          <option key={option.value} value={option.value}>
            {option.label} ({option.count})
          </option>
        ),
      )}
    </>
  );
}

/** Props for {@link DirectoryFacet}. */
type DirectoryFacetProps<Value extends string> = {
  /** The select's `id`, which ties it to its label. Must be unique within the page. */
  id: string;
  /** The visible label above the control, e.g., `"Party"`. */
  label: string;
  /**
   * How the "don't narrow on this" option reads, e.g., `"All Parties (541)"`. Worded by the caller, which knows whether
   * a total means anything for its facet.
   */
  anyLabel: string;
  /** The currently selected value. */
  value: string;
  /** Called with the newly selected value. */
  onChange: (value: Value) => void;
  /** The rest of the options, below the "any" one — usually {@link FacetOptions}, or `<optgroup>`s wrapping it. */
  children: ReactNode;
};

/**
 * One labeled facet dropdown, with {@link ANY_FACET} always offered first.
 *
 * @param props - {@link DirectoryFacetProps}.
 * @returns The labeled dropdown.
 */
export function DirectoryFacet<Value extends string>({
  id,
  label,
  anyLabel,
  value,
  onChange,
  children,
}: DirectoryFacetProps<Value>): JSX.Element {
  return (
    <div className="directory-facet">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        onChange={(event: ChangeEvent<HTMLSelectElement>): void => onChange(event.target.value as Value)}
        value={value}
      >
        <option value={ANY_FACET}>{anyLabel}</option>
        {children}
      </select>
    </div>
  );
}

/** Props for {@link DirectorySort}. */
type DirectorySortProps<Sort extends string> = {
  /** The select's `id`, which ties it to its label. Must be unique within the page. */
  id: string;
  /** Every order this directory can be read in, in the order they should appear. */
  options: readonly Sort[];
  /** How each order reads on screen. */
  labels: Readonly<Record<Sort, string>>;
  /** The order currently applied. */
  value: Sort;
  /** Called with the newly chosen order. */
  onChange: (sort: Sort) => void;
};

/**
 * A directory's "Sort By" control. Reordering in place isn't otherwise announced, so callers name the chosen order in
 * {@link DirectoryResultCount}'s live region.
 *
 * @param props - {@link DirectorySortProps}.
 * @returns The labeled sort dropdown.
 */
export function DirectorySort<Sort extends string>({
  id,
  options,
  labels,
  value,
  onChange,
}: DirectorySortProps<Sort>): JSX.Element {
  return (
    <div className="directory-facet directory-facet--sort">
      <label htmlFor={id}>
        <ArrowDownUp aria-hidden="true" size={13} /> Sort By
      </label>
      <select
        id={id}
        onChange={(event: ChangeEvent<HTMLSelectElement>): void => onChange(event.target.value as Sort)}
        value={value}
      >
        {options.map(
          (option: Sort): JSX.Element => (
            <option key={option} value={option}>
              {labels[option]}
            </option>
          ),
        )}
      </select>
    </div>
  );
}

/** Props for {@link ClearFiltersButton}. */
type ClearFiltersButtonProps = {
  /** Restores the directory's "no filters" state. */
  onClear: () => void;
};

/**
 * Returns a narrowed directory to showing everything. Callers render it only while a filter is active.
 *
 * @param props - {@link ClearFiltersButtonProps}.
 * @returns The clear button.
 */
export function ClearFiltersButton({ onClear }: ClearFiltersButtonProps): JSX.Element {
  return (
    <button className="directory-facets__clear" onClick={onClear} type="button">
      <X aria-hidden="true" size={14} /> Clear Filters
    </button>
  );
}

/**
 * What the member and committee directories say when filters match nothing. The bill directory words its own, since it
 * filters by stage rather than chamber.
 */
export const FACETED_DIRECTORY_EMPTY_ADVICE: string =
  "Try a shorter name, a different chamber, or clear the filters to start again.";

/** Props for {@link DirectoryEmptyState}. */
type DirectoryEmptyStateProps = {
  /** What happened, e.g., `"No Members Match Those Filters."` */
  heading: string;
  /** What to try next. */
  body: string;
  /** Undoes the narrowing. Omitted when filters didn't empty the list (e.g., a Congress with no records yet). */
  onClear?: () => void;
};

/**
 * What a directory shows in place of its grid when nothing survived. Repeats {@link ClearFiltersButton}, since the
 * facet row's copy has usually scrolled out of view by the time a reader sees an empty grid.
 *
 * @param props - {@link DirectoryEmptyStateProps}.
 * @returns The empty state, with the clear action when there is something to clear.
 */
export function DirectoryEmptyState({ heading, body, onClear }: DirectoryEmptyStateProps): JSX.Element {
  return (
    <div className="no-results">
      <h2>{heading}</h2>
      <p>{body}</p>
      {onClear ? <ClearFiltersButton onClear={onClear} /> : null}
    </div>
  );
}

/** Props for {@link DirectoryResultCount}. */
type DirectoryResultCountProps = {
  /** How many records are showing, already worded by the caller (`"12 of 541 Members"`, `"3 Matches"`). */
  count: string;
  /** The chosen order, named only when it isn't the directory's default. */
  order?: string;
};

/**
 * The line stating what is currently showing. A live region, so narrowing and reordering are both announced.
 *
 * @param props - {@link DirectoryResultCountProps}.
 * @returns The count line.
 */
export function DirectoryResultCount({ count, order }: DirectoryResultCountProps): JSX.Element {
  return (
    <p className="directory-result-count" aria-live="polite">
      <span>{count}</span>
      {order ? <span className="directory-result-count__order"> · Sorted by {order}</span> : null}
    </p>
  );
}

/**
 * Words what a faceted directory is showing: "12 of 541 Members" when narrowed, "541 Members" otherwise. Pluralized
 * against the total, so one match reads "1 of 541 Members".
 *
 * @param shown - How many records survived the filters.
 * @param total - How many there are in all.
 * @param noun - The singular noun for a record, cased as it should appear (`"Member"`, `"Committee"`).
 * @param isFiltered - Whether a filter is active. Not inferred from `shown !== total`, so a filter matching everything
 *   still shows its denominator.
 * @returns The count line, e.g., `"12 of 541 Members"`.
 */
export function directoryCountLabel(shown: number, total: number, noun: string, isFiltered: boolean): string {
  const plural: string = pluralize(total, noun);

  return isFiltered ? `${shown} of ${total} ${plural}` : `${total} ${plural}`;
}
