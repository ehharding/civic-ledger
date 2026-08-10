import { ArrowDownUp, Search, SlidersHorizontal, X } from "lucide-react";
import type { ChangeEvent, JSX, ReactNode } from "react";

import { ANY_FACET, type FacetOption } from "@/lib/congress/directory-filter";
import { pluralize } from "@/lib/format";

/**
 * Every control the three directories are assembled from: the search field and segmented filter they open with, the
 * facet dropdowns and sort control beneath those, the "Clear Filters" action, and the result count that describes what
 * survived.
 *
 * `BillDirectory`, `MemberDirectory`, and `CommitteeDirectory` narrow completely different things — bills by
 * legislative stage, members by chamber and party and state, committees by chamber and type — but they present those
 * choices identically, and a reader who has used one directory should not have to relearn the next. Keeping the
 * controls here is what makes that guarantee structural rather than a convention someone has to remember to follow. It
 * is the same argument `directory.css` already makes for these controls' *styling*, and the same one
 * `useDirectoryUrlSync` makes for their URL behavior, applied to the markup in between.
 *
 * Every control here is deliberately uncontrolled about its *meaning*: it renders whatever options and labels it is
 * handed and reports back what was picked. None of them knows what a stage, a chamber, or a committee type is.
 */

/** Props for {@link DirectorySearch}. */
type DirectorySearchProps = {
  /** The input's `id`, which ties it to its label. Must be unique within the page. */
  id: string;
  /**
   * The visually hidden label. Spelled out more fully than the placeholder, since a placeholder disappears the moment
   * someone starts typing and is not a substitute for a label.
   */
  label: string;
  /** The placeholder shown in the empty field. */
  placeholder: string;
  /** The current query. */
  value: string;
  /** Called with the new query on every keystroke — debouncing, if any, belongs to the caller. */
  onChange: (value: string) => void;
};

/**
 * A directory's search field.
 *
 * `type="search"` rather than `type="text"` so the browser offers its own clear button and, on touch keyboards, a
 * search key rather than a return key.
 *
 * @param props - @see DirectorySearchProps
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
 * A row of mutually exclusive filter buttons.
 *
 * A `<fieldset>` with a hidden `<legend>` rather than a bare `<div>`: the buttons are one choice made of several
 * controls, and without the grouping a screen reader announces each one with no indication of what it filters or that
 * the others exist.
 *
 * `aria-pressed` rather than `aria-selected` because these are toggle buttons, not tabs or listbox options — nothing
 * here reveals a panel, so the tab pattern's keyboard expectations would be promised and not delivered.
 *
 * @param props - @see SegmentedFilterProps
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
  /**
   * The values to offer, already ordered and already counted.
   * @see FacetOption
   */
  options: readonly FacetOption<Value>[];
};

/**
 * A facet dropdown's `<option>` list, each entry carrying its count.
 *
 * The count in the label is not decoration — @see FacetOption for why every facet in this app names how many records
 * sit behind a choice before a reader makes it.
 *
 * @param props - @see FacetOptionsProps
 * @returns One `<option>` per value.
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
   * How the "don't narrow on this" option reads, e.g., `"All Parties (541)"`. Spelled by the caller rather than
   * composed here, since only the caller knows whether a total is meaningful for its facet — it is for a party, and
   * isn't for a jurisdiction list whose groups are counted separately.
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
 * The wildcard option is rendered here rather than left to each caller for the same reason the sentinel itself is
 * declared once: "this facet can always be switched off, and switching it off is always the first choice" is a rule,
 * and a rule stated in one place is one that cannot be forgotten in the fourth directory.
 *
 * @param props - @see DirectoryFacetProps
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
 * A directory's "Sort By" control.
 *
 * Reordering the grid in place is *not* the WCAG 3.2.2 (On Input) pattern the Congress picker has to advise about:
 * nothing navigates, and the reader stays exactly where they were. It does still need announcing, which is why every
 * caller names the chosen order in {@link DirectoryResultCount} — a live region — rather than leaving the change only
 * visible in the grid.
 *
 * @param props - @see DirectorySortProps
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

/**
 * The action that returns a narrowed directory to showing everything.
 *
 * Rendered only when something is actually narrowed — every directory guards it with its own `hasActive…Filters` — so
 * the control is never offered with nothing to do.
 *
 * @param onClear - Restores that directory's "no filters" state.
 * @returns The clear button.
 */
export function ClearFiltersButton({ onClear }: { onClear: () => void }): JSX.Element {
  return (
    <button className="directory-facets__clear" onClick={onClear} type="button">
      <X aria-hidden="true" size={14} /> Clear Filters
    </button>
  );
}

/** Props for {@link DirectoryEmptyState}. */
type DirectoryEmptyStateProps = {
  /** What happened, e.g., `"No Members Match Those Filters."` */
  heading: string;
  /** What to try next. */
  body: string;
  /**
   * Undoes the narrowing, when narrowing is what emptied the list.
   *
   * Omitted when it isn't — the bill directory's "no records yet" state is a fact about the Congress being browsed
   * rather than about the filters, and offering to clear filters there would be offering a control that changes
   * nothing.
   */
  onClear?: () => void;
};

/**
 * What a directory shows in place of its grid when nothing survived.
 *
 * All three directories reach this state and all three word it the same way — a heading naming what happened and a line
 * suggesting what to try — so the markup lives beside the controls that produced the state rather than in each of them.
 *
 * **The advice is a control, not only a sentence.** These states tell the reader to clear the filters, and the only
 * other control that does it sits in the facet row, which an empty grid has usually scrolled out of view — so the
 * sentence would be asking for something the interface is standing right there able to do. It renders the same
 * {@link ClearFiltersButton} the facet row does, so clearing from here and clearing from there are visibly one action
 * rather than two that happen to agree.
 *
 * @param props - @see DirectoryEmptyStateProps
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
  /**
   * The chosen order, named only when it isn't the directory's default — so the common case stays a plain count rather
   * than restating "alphabetical" on every page load. Omitted entirely by the bill directory, which has no sort
   * control.
   */
  order?: string;
};

/**
 * The line stating what is currently showing.
 *
 * A live region, which is what makes it do double duty: it reports the result of a narrowing to a reader who cannot see
 * the grid change, and it is where a reordering gets announced, since reordering in place changes nothing else a screen
 * reader would notice.
 * @see DirectorySort.
 *
 * @param props - @see DirectoryResultCountProps
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
 * Words what a faceted directory is currently showing, for {@link DirectoryResultCount}.
 *
 * The rule, rather than the sentence: a narrowed list says how much of the whole it is ("12 of 541 Members"), and an
 * unnarrowed one just says how much there is ("541 Members"). The denominator is what makes a narrowing legible — "12
 * Members" alone reads the same whether it filtered out five hundred people or five — and dropping it once the filters
 * are cleared is what keeps the ordinary case from reading as a fraction of itself.
 *
 * Both counts are pluralized against the *total* rather than against what survived, so a filter matching exactly one
 * record still reads "1 of 541 Members" rather than "1 of 541 Member".
 *
 * @param shown - How many records survived the filters.
 * @param total - How many there are in all.
 * @param noun - The singular noun for a record, cased as it should appear (`"Member"`, `"Committee"`).
 * @param isFiltered - Whether anything is actually narrowing the list. Passed in rather than inferred from
 *   `shown !== total`, since a filter that happens to match everything is still a filter, and a count that silently
 *   dropped its denominator would make clearing it look like it did nothing.
 * @returns The count line, e.g., `"12 of 541 Members"`.
 */
export function directoryCountLabel(shown: number, total: number, noun: string, isFiltered: boolean): string {
  const plural: string = pluralize(total, noun);

  return isFiltered ? `${shown} of ${total} ${plural}` : `${total} ${plural}`;
}
