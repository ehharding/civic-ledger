/**
 * The vocabulary shared by all three directories (`bills/search.ts`, `members/filter.ts`, `committees/filter.ts`): the
 * wildcard sentinel, facet options, total parsers, query-string serialization, facet counting, and tiebroken sorting.
 * Pure and isomorphic, since the browser imports it.
 *
 * Each directory's param names, facets, sorts, and comparators stay in its own module — only the genuinely identical
 * parts live here.
 */

/**
 * The wildcard every facet filter uses for "don't narrow on this". `"all"` reads clearly in a URL, though serializers
 * omit a facet at its default rather than writing it.
 */
export const ANY_FACET = "all" as const;

/** A facet filter's value: one of the directory's own choices, or {@link ANY_FACET}. */
export type FacetFilter<Value extends string> = Value | typeof ANY_FACET;

/**
 * One selectable value in a facet control, with its record count — so "Ohio (15)" says what a choice will yield before
 * it's made, and a non-alphabetical order (like the party control's) reads as deliberate.
 *
 * @typeParam Value - The filter value this option sets.
 */
export type FacetOption<Value> = {
  /** The value written to the directory's filter state, and to the URL. */
  value: Value;
  /** How the option reads on screen. */
  label: string;
  /** How many records in the whole list carry this value. */
  count: number;
};

/**
 * Cap on the free-text query any directory carries in its URL. Matches {@link MAX_QUERY_LENGTH} in `api-query.ts`, but
 * restated so the browser doesn't pull in that module's zod dependency.
 */
export const MAX_DIRECTORY_QUERY_LENGTH: number = 200;

/**
 * Reads a directory's free-text `q` param.
 *
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @returns The trimmed query, truncated to {@link MAX_DIRECTORY_QUERY_LENGTH}; empty (match everything) when absent.
 */
export function parseQueryFilter(raw: string | null | undefined): string {
  return (raw ?? "").trim().slice(0, MAX_DIRECTORY_QUERY_LENGTH);
}

/**
 * Resolves a param against a closed set of values — the body behind every facet and sort parser. Total: an absent,
 * malformed, or stale param (hand-edited, truncated, or old links) falls back rather than erroring. Trimmed and
 * case-insensitive, so `?chamber=Senate` works.
 *
 * @typeParam Value - The union of allowed values.
 * @typeParam Fallback - What an unrecognized param resolves to. Usually {@link ANY_FACET} for a facet, or the
 *   directory's default order for a sort.
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @param allowed - Every value the param may name.
 * @param fallback - What to return for anything else.
 * @returns The matched value, or `fallback`.
 */
export function parseEnumParam<Value extends string, Fallback>(
  raw: string | null | undefined,
  allowed: readonly Value[],
  fallback: Fallback,
): Value | Fallback {
  const value: string = (raw ?? "").trim().toLowerCase();

  return allowed.find((candidate: Value): boolean => candidate === value) ?? fallback;
}

/**
 * Finishes a directory's query string, so an unnarrowed directory has a clean URL.
 *
 * @param params - The non-default values the view wrote, already in the fixed order each serializer sets them in.
 * @returns The query string including its leading `?`, or an empty string when nothing was narrowed or reordered.
 */
export function toQueryString(params: URLSearchParams): string {
  const serialized: string = params.toString();

  return serialized.length > 0 ? `?${serialized}` : "";
}

/**
 * Tallies how many records carry each value of one facet.
 *
 * @typeParam Item - The kind of record being counted.
 * @typeParam Value - The facet value each record carries.
 * @param items - Every record in the directory. Callers pass the whole list, so picking one facet never empties
 *   another.
 * @param facetOf - Reads the facet value off a record, or `undefined` when it has none (counted toward nothing).
 * @returns One entry per value present, in first-seen order.
 * @see buildFacetOptions
 */
export function countFacetValues<Item, Value>(
  items: readonly Item[],
  facetOf: (item: Item) => Value | undefined,
): Map<Value, number> {
  const counts: Map<Value, number> = new Map<Value, number>();

  for (const item of items) {
    const value: Value | undefined = facetOf(item);
    if (value !== undefined) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

/**
 * Builds a facet control's options from the records in hand. Order comes from the model (`order`), not from counts or
 * labels, and a value nobody holds isn't offered.
 *
 * @typeParam Item - The kind of record being counted.
 * @typeParam Value - The facet value each record carries.
 * @param items - Every record in the directory.
 * @param facetOf - Reads the facet value off a record.
 * @param order - Every value the facet can take, in the order the control should read.
 * @param labelOf - How a value reads on screen.
 * @returns One option per value actually present, in `order`, each carrying its count.
 * @see countFacetValues
 */
export function buildFacetOptions<Item, Value>(
  items: readonly Item[],
  facetOf: (item: Item) => Value | undefined,
  order: readonly Value[],
  labelOf: (value: Value) => string,
): FacetOption<Value>[] {
  const counts: Map<Value, number> = countFacetValues(items, facetOf);
  const options: FacetOption<Value>[] = [];

  for (const value of order) {
    const count: number | undefined = counts.get(value);
    if (count !== undefined) options.push({ value, label: labelOf(value), count });
  }

  return options;
}

/**
 * Orders a directory, falling back to a tiebreak where the chosen order calls two records equal — so "by party" means
 * "by party, then alphabetically".
 *
 * @typeParam Item - The kind of record being ordered.
 * @param items - The records to order. Left untouched; a new array is returned.
 * @param compare - The chosen order's comparator.
 * @param tiebreak - How to order records the primary comparator calls equal. Usually the directory's alphabetical
 *   comparator, which is why a directory's own "Name (A–Z)" order can pass a comparator that does nothing.
 * @returns A newly ordered array.
 */
export function sortWithTiebreak<Item>(
  items: readonly Item[],
  compare: (a: Item, b: Item) => number,
  tiebreak: (a: Item, b: Item) => number,
): Item[] {
  return items.toSorted((a: Item, b: Item): number => {
    const primary: number = compare(a, b);
    return primary !== 0 ? primary : tiebreak(a, b);
  });
}
