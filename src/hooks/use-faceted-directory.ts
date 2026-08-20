import { type Dispatch, type SetStateAction, useCallback, useState } from "react";

import { useDirectoryUrlSync } from "@/hooks/use-directory-url-sync";

/**
 * The state every faceted directory holds, and the reconciliation that keeps it and the address bar agreeing.
 *
 * `MemberDirectory` and `CommitteeDirectory` are the same component in two subjects. They narrow different
 * things — people by chamber, party, and state; committees by chamber and type — but everything *around* that narrowing
 * was identical and spelled out twice: two `useState` calls, the two query strings, the parser wrapped in a
 * `useCallback` so a `popstate` listener can hold it, the `useDirectoryUrlSync` call, the "is anything narrowed" flag,
 * and the patch helper that sets one facet without disturbing the others. Roughly twenty lines each, and none of it
 * about members or committees.
 *
 * That is the same argument `directory-filter.ts` makes for the parsing, `directory-controls.tsx` for the markup, and
 * `useDirectoryUrlSync` for the URL reconciliation, applied to the last part of these two components that was still
 * being written twice. What is left at each call site is what the directory is actually *about*: which facets it has,
 * what they mean, and how its records read.
 *
 * Layered on {@link useDirectoryUrlSync} rather than folded into it, because the bill directory is the third caller of
 * that hook and is deliberately not this shape — it has no sort control, its results come from a debounced server-side
 * sweep rather than from a list already in hand, and it holds paging state neither of these two has. A shared
 * abstraction that had to accommodate it would fit none of the three.
 *
 * Generic over both halves of a view, so neither directory gives up any type safety for the sharing: `update` takes a
 * `Partial` of *that* directory's filters, and a facet it has no field for is a compile error rather than a silently
 * ignored key.
 */

/** Everything a faceted directory's URL can express: what to show, and in what order. */
type FacetedDirectoryQuery<Filters, Sort> = {
  filters: Filters;
  sort: Sort;
};

/** Options for {@link useFacetedDirectory}. */
type FacetedDirectoryOptions<Filters, Sort> = {
  /**
   * The view the URL asked for, resolved server-side, which the directory opens on. @see resolveMemberDirectoryQuery
   * and its committee counterpart.
   */
  initialQuery: FacetedDirectoryQuery<Filters, Sort>;
  /** No narrowing at all — what {@link FacetedDirectoryState.clear} restores. */
  noFilters: Filters;
  /** Whether any filter is actually narrowing the list, which decides whether "Clear Filters" is offered at all. */
  hasActiveFilters: (filters: Filters) => boolean;
  /** This directory's spelling of a view as a query string. @see memberDirectoryQueryString */
  serialize: (query: FacetedDirectoryQuery<Filters, Sort>) => string;
  /**
   * Reads a view back out of a query string, through the *same* parser the route uses, so the browser and the server
   * cannot disagree about what a link means.
   *
   * Must be referentially stable — wrap it in `useCallback` — since it ends up registered against a `popstate`
   * listener. The member directory's closes over the roster's jurisdictions and so lists them as a dependency; the
   * committee directory's closes over nothing and has an empty one.
   */
  parse: (search: string) => FacetedDirectoryQuery<Filters, Sort>;
};

/** What {@link useFacetedDirectory} hands back to a directory component. */
type FacetedDirectoryState<Filters, Sort> = {
  /** The narrowing currently applied. */
  filters: Filters;
  /** The order currently applied. */
  sort: Sort;
  /** Sets the order. Passed straight to `DirectorySort`, whose `onChange` has exactly this shape. */
  setSort: Dispatch<SetStateAction<Sort>>;
  /** Applies one facet without disturbing the others. */
  update: (patch: Partial<Filters>) => void;
  /** Returns the directory to showing everything. */
  clear: () => void;
  /** Whether anything is narrowing the list. @see FacetedDirectoryOptions.hasActiveFilters */
  isFiltered: boolean;
};

/**
 * Holds one faceted directory's view, and keeps the address bar and that view agreeing.
 *
 * @typeParam Filters - The directory's own narrowing state. @see MemberFilters, CommitteeFilters
 * @typeParam Sort - The directory's own set of orders. @see MemberSort, CommitteeSort
 * @param options - @see FacetedDirectoryOptions
 * @returns The current view and the four ways a directory's controls change it. @see FacetedDirectoryState
 */
export function useFacetedDirectory<Filters, Sort>({
  initialQuery,
  noFilters,
  hasActiveFilters,
  serialize,
  parse,
}: FacetedDirectoryOptions<Filters, Sort>): FacetedDirectoryState<Filters, Sort> {
  const [filters, setFilters] = useState<Filters>(initialQuery.filters);
  const [sort, setSort] = useState<Sort>(initialQuery.sort);

  /**
   * Takes the view a URL names as the current one.
   *
   * Depends on `parse` alone: `setFilters` and `setSort` are `useState` setters, which React guarantees are stable for
   * the life of the component, so listing them would say nothing.
   */
  const adopt = useCallback(
    (search: string): void => {
      const view: FacetedDirectoryQuery<Filters, Sort> = parse(search);

      setFilters(view.filters);
      setSort(view.sort);
    },
    [parse],
  );

  useDirectoryUrlSync({
    adopt,
    queryString: serialize({ filters, sort }),
    requestedQueryString: serialize(initialQuery),
  });

  return {
    filters,
    sort,
    setSort,
    update: (patch: Partial<Filters>): void => {
      setFilters((current: Filters): Filters => ({ ...current, ...patch }));
    },
    clear: (): void => setFilters(noFilters),
    isFiltered: hasActiveFilters(filters),
  };
}
