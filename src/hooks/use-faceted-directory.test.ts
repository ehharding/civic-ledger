/**
 * Covers useFacetedDirectory directly, rather than only incidentally through the two directories that use it.
 *
 * The hook holds the twenty lines both faceted directories used to spell out for themselves, and the reason to test it
 * on its own is that the interesting cases are the ones neither component makes easy to reach: that `update` patches
 * one facet without disturbing the others, that `clear` restores the caller's own "no filters" value rather than an
 * emptied object, and that `isFiltered` is asked of the caller rather than inferred — a filter that happens to match
 * everything is still a filter.
 *
 * A deliberately made-up pair of types, not the member or committee ones. The hook is generic over both halves of a
 * view, and testing it against a real directory's filters would let an accidental dependence on that directory's shape
 * pass unnoticed.
 */
import { act, type RenderHookResult, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useFacetedDirectory } from "@/hooks/use-faceted-directory";

type Filters = { query: string; color: string };
type Sort = "name" | "age";

const NO_FILTERS: Filters = { query: "", color: "all" };

const nativeReplaceState: typeof window.history.replaceState = window.history.replaceState.bind(window.history);

/** This fake directory's spelling of a view — only what isn't at its default, as every real serializer does. */
function serialize({ filters, sort }: { filters: Filters; sort: Sort }): string {
  const params: URLSearchParams = new URLSearchParams();

  if (filters.query.length > 0) params.set("q", filters.query);
  if (filters.color !== "all") params.set("color", filters.color);
  if (sort !== "name") params.set("sort", sort);

  const serialized: string = params.toString();
  return serialized.length > 0 ? `?${serialized}` : "";
}

/** The exact counterpart, and total in the same sense every real parser is. */
function parse(search: string): { filters: Filters; sort: Sort } {
  const params: URLSearchParams = new URLSearchParams(search);

  return {
    filters: { query: params.get("q") ?? "", color: params.get("color") ?? "all" },
    sort: params.get("sort") === "age" ? "age" : "name",
  };
}

type Rendered = RenderHookResult<ReturnType<typeof useFacetedDirectory<Filters, Sort>>, unknown>;

function renderDirectory(initialQuery: { filters: Filters; sort: Sort }): Rendered {
  return renderHook(
    (): ReturnType<typeof useFacetedDirectory<Filters, Sort>> =>
      useFacetedDirectory<Filters, Sort>({
        hasActiveFilters: (filters: Filters): boolean => filters.query.length > 0 || filters.color !== "all",
        initialQuery,
        noFilters: NO_FILTERS,
        parse,
        serialize,
      }),
  );
}

beforeEach((): void => {
  nativeReplaceState(null, "", "/things");
});

afterEach((): void => {
  nativeReplaceState(null, "", "/");
});

describe("useFacetedDirectory", (): void => {
  it("opens on the view the route resolved", (): void => {
    const { result }: Rendered = renderDirectory({ filters: { query: "ohio", color: "teal" }, sort: "age" });

    expect(result.current.filters).toEqual({ query: "ohio", color: "teal" });
    expect(result.current.sort).toBe("age");
    expect(result.current.isFiltered).toBe(true);
  });

  it("patches one facet without disturbing the others", (): void => {
    const { result }: Rendered = renderDirectory({ filters: { query: "ohio", color: "teal" }, sort: "name" });

    act((): void => result.current.update({ color: "burgundy" }));

    // The whole point of the patch helper: a control that sets one facet must not silently drop the rest of the view.
    expect(result.current.filters).toEqual({ query: "ohio", color: "burgundy" });
    expect(result.current.sort).toBe("name");
  });

  it("restores the caller's own unfiltered value rather than an emptied one", (): void => {
    const { result }: Rendered = renderDirectory({ filters: { query: "ohio", color: "teal" }, sort: "age" });

    act((): void => result.current.clear());

    // `color` goes back to the wildcard sentinel, not to an empty string — clearing a facet means "don't narrow on
    // this", which is a value rather than the absence of one. @see ANY_FACET.
    expect(result.current.filters).toEqual(NO_FILTERS);
    expect(result.current.isFiltered).toBe(false);
    // Clearing the filters leaves the chosen order alone: a reader who cleared a search did not ask to be re-sorted.
    expect(result.current.sort).toBe("age");
  });

  it("changes the order without touching the filters", (): void => {
    const { result }: Rendered = renderDirectory({ filters: { query: "ohio", color: "all" }, sort: "name" });

    act((): void => result.current.setSort("age"));

    expect(result.current.sort).toBe("age");
    expect(result.current.filters).toEqual({ query: "ohio", color: "all" });
  });

  it("asks the caller whether anything is narrowed rather than inferring it", (): void => {
    const { result }: Rendered = renderDirectory({ filters: NO_FILTERS, sort: "name" });

    expect(result.current.isFiltered).toBe(false);

    act((): void => result.current.update({ color: "teal" }));

    expect(result.current.isFiltered).toBe(true);
  });

  it("mirrors a narrowing into the address bar", (): void => {
    const { result }: Rendered = renderDirectory({ filters: NO_FILTERS, sort: "name" });

    act((): void => result.current.update({ query: "ohio" }));

    expect(window.location.search).toBe("?q=ohio");
    // The path survives the write, so a mirrored view stays on the page it describes.
    expect(window.location.pathname).toBe("/things");
  });

  it("leaves an unnarrowed directory with a clean URL", (): void => {
    // The address bar is set before the render, the way the route's own resolution leaves it — moving it afterwards
    // would look to the hook like a navigation, and it would rightly adopt the URL instead of writing over it.
    nativeReplaceState(null, "", "/things?q=ohio");
    const { result }: Rendered = renderDirectory({ filters: { query: "ohio", color: "all" }, sort: "name" });

    act((): void => result.current.clear());

    expect(window.location.search).toBe("");
  });

  it("follows the URL when something else moves it", (): void => {
    const { result }: Rendered = renderDirectory({ filters: NO_FILTERS, sort: "name" });

    // A soft navigation to another view of the same route: the URL moves without this component remounting, so the
    // state is what has to catch up. @see useDirectoryUrlSync, which decides that.
    act((): void => {
      nativeReplaceState(null, "", "/things?color=teal&sort=age");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current.filters).toEqual({ query: "", color: "teal" });
    expect(result.current.sort).toBe("age");
  });
});
