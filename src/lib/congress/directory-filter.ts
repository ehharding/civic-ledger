/**
 * The vocabulary all three of this app's directories narrow themselves with.
 *
 * `search.ts` (bills), `member-filter.ts`, and `committee-filter.ts` are deliberately the same design in three
 * subjects — same wildcard sentinel, same facet-option shape, same total parsers, same only-write-what-isn't-default
 * serialization. Each of those files says so in its own header, and until now that was the only thing making it true:
 * three modules each declared their own `"all"` under a different name, their own byte-identical facet-option type,
 * their own `200`-character cap, and seven parsers with one shared body between them.
 *
 * A sameness that is asserted in prose is a sameness that drifts. This module is that shared vocabulary stated once,
 * for the same reason `compareText` in `format.ts` replaced two collators and four bare `localeCompare` calls: a rule
 * that lives in one place is a rule that applies everywhere, rather than one that applies wherever someone remembered
 * to reach for it.
 *
 * Pure and isomorphic, as its three consumers have to be — the browser imports all of them, and none may drag the
 * server-only adapter, or the API key it reads, into a client bundle behind it.
 *
 * What is deliberately *not* here: each directory's param names, its facet unions, its sort orders, and its comparators.
 * What a view means is that directory's own business, and a shared "filters" abstraction covering three different sets
 * of facets would be a worse fit than three explicit ones. Only the parts that are genuinely identical live here.
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
 * which matters most for the member directory's party control: "Democratic (213), Independent (2), Republican (220)"
 * is plainly the chamber diagram's left-to-right order, while the same three words alone are plainly nothing in
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
 * The two are stated separately on purpose and the direction of the dependency is the reason: that module is
 * zod-backed and server-oriented, and a client component importing this one must not pull schema validation into the
 * browser bundle behind it. Here the limit is protecting no request at all — every directory matches this text against
 * a list the server already sent — it only keeps an unbounded string from riding through the URL and into the page
 * payload.
 */
export const MAX_DIRECTORY_QUERY_LENGTH: number = 200;

/**
 * Reads a directory's free-text `q` param.
 *
 * @param raw - The raw param value, or `null`/`undefined` when absent.
 * @returns The trimmed query, truncated to {@link MAX_DIRECTORY_QUERY_LENGTH}. An absent or blank param yields an empty
 *   string, which every directory's matcher treats as matching everything — which is what makes clearing the search
 *   box mean "show me everything again".
 */
export function parseQueryFilter(raw: string | null | undefined): string {
  return (raw ?? "").trim().slice(0, MAX_DIRECTORY_QUERY_LENGTH);
}

/**
 * Resolves a param against a closed set of values it is allowed to name.
 *
 * The single body behind every facet and sort parser in all three directories. Each of those keeps its own name, its
 * own documented return type, and its own tests — what they share is this rule, and it is worth stating once because
 * it is what makes all of them *total* in the sense `src/lib/api-query.ts` describes: an absent, malformed, or stale
 * param resolves to a usable default rather than to an error. A shared link is exactly the kind of URL that gets
 * hand-edited, truncated by a chat client, or opened a year later, and none of those should produce anything worse
 * than the unfiltered page.
 *
 * Matching is case-insensitive after trimming, so a hand-typed `?chamber=Senate` resolves the same as `?chamber=senate`
 * — the allowed values are all lower case, which is how they are written to the URL in the first place.
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
