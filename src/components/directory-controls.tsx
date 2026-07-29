import { Search, SlidersHorizontal } from "lucide-react";
import type { ChangeEvent, JSX } from "react";

/**
 * The control row both directories open with: a search field beside a segmented filter.
 *
 * `BillDirectory` and `MemberDirectory` narrow completely different things — bills by legislative stage, members by
 * chamber — but they present that choice identically, and a reader who has used one directory should not have to
 * relearn the other. Keeping the two controls here is what makes that guarantee structural rather than a convention
 * someone has to remember to follow.
 *
 * Both are deliberately uncontrolled about their *meaning*: they render whatever options and labels they are handed
 * and report back what was picked. Neither knows what a stage or a chamber is.
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
