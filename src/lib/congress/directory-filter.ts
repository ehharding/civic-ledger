/**
 * The vocabulary all three of this app's directories narrow themselves with.
 *
 * `bills/search.ts` (bills), `members/filter.ts`, and `committees/filter.ts` are deliberately the same design in three
 * subjects — same wildcard sentinel, same facet-option shape, same total parsers, same only-write-what-isn't-default
 * serialization. That sameness is held here, in one shared vocabulary, rather than asserted in three headers: a
 * sameness that is only described in prose is a sameness that drifts. It is the same argument `compareText` in
 * `format.ts` makes for ordering — a rule that lives in one place is a rule that applies everywhere, rather than one
 * that applies wherever someone remembered to reach for it — and it extends past parsing to the two things every
 * faceted directory then *does* with a list: count its facets ({@link buildFacetOptions}) and order it
 * ({@link sortWithTiebreak}).
 *
 * Pure and isomorphic, as its three consumers have to be — the browser imports all of them, and none may drag the
 * server-only adapter, or the API key it reads, into a client bundle behind it.
 *
 * What is deliberately *not* here: each directory's param names, its facet unions, its sort orders, and its
 * comparators. What a view means is that directory's own business, and a shared "filters" abstraction covering three
 * different sets of facets would be a worse fit than three explicit ones. Only the parts that are genuinely identical
 * live here.
 */

/**
 * The wildcard value every facet filter uses for "don't narrow on this at all".
 *
 * One sentinel rather than one per directory, so a reader who meets `ANY_FACET` in the committee code already knows
 * what it means from the member code. It is `"all"` because that is what it reads as in a URL (`?chamber=all` is
 * self-explanatory in a way `?chamber=*` is not), though it is only ever *written* to a URL by omission — @see any of
 * the `…QueryString` serializers, which skip a facet sitting at its default.
 */
export const ANY_FACET = "all" as const;

/** A facet filter's value: one of the directory's own choices, or {@link ANY_FACET}. */
export type FacetFilter<Value extends string> = Value | typeof ANY_FACET;

/**
 * One selectable value in a facet control, with the number of records behind it.
 *
 * The count is the reason this isn't a bare list of strings. A facet reading "Ohio (15)" or "Standing (21)" tells a
 * reader what a choice will yield *before* they make it, which is the difference between a list you can plan a
 * narrowing with and one you have to probe by trial and error. It also makes these lists' ordering self-explanatory,
 * which matters most for the member directory's party control: "Democratic (213), Independent (2), Republican (220)" is
 * plainly the chamber diagram's left-to-right order, while the same three words alone are plainly nothing in
 * particular.
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
 * Cap on the free-text query any directory carries in its URL.
 *
 * Matches {@link MAX_QUERY_LENGTH} in `src/lib/api-query.ts`, which bounds the same text where it reaches a *request*.
 * The two are stated separately on purpose and the direction of the dependency is the reason: that module is zod-backed
 * and server-oriented, and a client component importing this one must not pull schema validation into the browser
 * bundle behind it. Here the limit is protecting no request at all — every directory matches this text against a list
 * the server already sent — it only keeps an unbounded string from riding through the URL and into the page payload.
 */
export const MAX_DIRECTORY_QUERY_LENGTH: number = 200;

/**
 * Reads a directory's free-text `q` param.
 *
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @returns The trimmed query, truncated to {@link MAX_DIRECTORY_QUERY_LENGTH}. An absent or blank param yields an empty
 *   string, which every directory's matcher treats as matching everything — which is what makes clearing the search box
 *   mean "show me everything again".
 */
export function parseQueryFilter(raw: string | null | undefined): string {
  return (raw ?? "").trim().slice(0, MAX_DIRECTORY_QUERY_LENGTH);
}

/**
 * Resolves a param against a closed set of values it is allowed to name.
 *
 * The single body behind every facet and sort parser in all three directories. Each of those keeps its own name, its
 * own documented return type, and its own tests — what they share is this rule, and it is worth stating once because it
 * is what makes all of them *total* in the sense `src/lib/api-query.ts` describes: an absent, malformed, or stale param
 * resolves to a usable default rather than to an error. A shared link is exactly the kind of URL that gets hand-edited,
 * truncated by a chat client, or opened a year later, and none of those should produce anything worse than the
 * unfiltered page.
 *
 * Matching is case-insensitive after trimming, so a hand-typed `?chamber=Senate` resolves the same as
 * `?chamber=senate` — the allowed values are all lower case, which is how they are written to the URL in the first
 * place.
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
 * Finishes a directory's query string.
 *
 * Trivial, and shared anyway: all three serializers end with this exact conditional, and the contract it encodes — an
 * unnarrowed directory has a *clean* URL rather than one carrying params that all say "no" — is the reason a shared
 * link is worth copying at all.
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
 * The counting loop behind every facet control in the app — the member directory's party and jurisdiction lists and the
 * committee directory's type list. Three lines, shared because each copy of them would have to remember the same two
 * things: that a `Map` lookup returns `undefined` before the first increment, and that a record carrying no value for
 * the facet contributes to nothing rather than to a blank option.
 *
 * @typeParam Item - The kind of record being counted.
 * @typeParam Value - The facet value each record carries.
 * @param items - Every record in the directory, filtered or not. Callers pass the *whole* list, so choosing one facet
 *   never empties another out from under the reader mid-narrowing.
 * @param facetOf - Reads the facet value off a record, or returns `undefined` when the record carries none — an unnamed
 *   place is not a place a reader can choose, so it is counted toward nothing.
 * @returns One entry per value present, in first-seen order. Callers impose their own order. @see buildFacetOptions
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
 * Builds a facet control's options from the records in hand, in an order the facet's own model declares.
 *
 * Two rules, both of which every facet in this app holds:
 *
 * - **Order comes from the model, not the data.** Parties read in the chamber diagram's left-to-right order and
 *   committee types read from the most consequential kind to the least, because `order` says so — not because of how
 *   many of each the roster happens to hold or how their labels happen to alphabetize.
 * - **A value nobody holds is not offered.** Filtering `order` down to what is actually present is what keeps a control
 *   from ever presenting a choice that can only return an empty grid.
 *
 * The count is read off the map once rather than tested for membership and then looked up, which is why there is no
 * unreachable `?? 0` here to exempt from coverage.
 *
 * @typeParam Item - The kind of record being counted.
 * @typeParam Value - The facet value each record carries.
 * @param items - Every record in the directory.
 * @param facetOf - Reads the facet value off a record. @see countFacetValues
 * @param order - Every value the facet can take, in the order the control should read.
 * @param labelOf - How a value reads on screen.
 * @returns One option per value actually present, in `order`, each carrying its count.
 *   @see FacetOption for why the count is not decoration.
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
 * Orders a directory, falling back to a tiebreak wherever the chosen order says two records are equal.
 *
 * The shape both faceted directories sort with, and the reason it is worth stating once is the tiebreak rather than the
 * sort: without it, grouping a roster by party lists each party in whatever arbitrary order the group happened to
 * arrive in, which reads as unsorted to anyone who asked for a sort. With it, "by party" means "by party, then
 * alphabetically" everywhere, rather than wherever someone remembered to add the second comparison.
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
