import { type RefObject, useEffect, useRef } from "react";

/** Options for {@link useDirectoryUrlSync}. */
type DirectoryUrlSyncOptions = {
  /**
   * The query string describing what the directory is currently showing, leading `?` included, or an empty string for
   * an unnarrowed view. Every directory has its own serializer for this — `memberDirectoryQueryString` and friends —
   * because the spelling of a view is that directory's own business; only the reconciling is shared.
   */
  queryString: string;
  /**
   * The query string for the view the *server* resolved, in the same spelling. Empty means the route resolved nothing,
   * which is how a static export is recognized. @see the mount case in the hook's first effect.
   */
  requestedQueryString: string;
  /**
   * Takes the view a URL names as the current one, by parsing it and pushing it into the component's state.
   *
   * Must be referentially stable — wrap it in `useCallback` — since the `popstate` listener is registered against it.
   * Each directory passes its own parser here, which is what keeps the browser and the server from ever disagreeing
   * about what a given link means.
   */
  adopt: (search: string) => void;
};

/**
 * Keeps a directory's address bar and its visible view agreeing, in whichever direction is out of date.
 *
 * All three directories in this app — bills, members, committees — are places you can link to: a search, a set of
 * facets, a chosen order. Each one filters in the browser and mirrors what it is showing back into the URL, so any
 * state of the page can be copied out of the address bar and handed to someone else.
 *
 * That mirroring is the same problem three times over, and it is a genuinely fiddly one, so it lives here once rather
 * than being re-derived per directory. Two of the three carried a verbatim copy of this logic; the third had only the
 * write half, and so had the bug the other two describe: following the header's own "Bills" link from an
 * already-narrowed directory appeared to do nothing, because the component wrote its stale query string straight back
 * over the URL the router had just set.
 *
 * The subtlety is that "the reader narrowed something" and "the URL changed underneath us" are indistinguishable from
 * inside a render and need opposite responses — one should rewrite the URL, the other should rewrite the state. What
 * separates them is remembering what this hook last wrote. @see the effect below for the three cases that fall out of
 * that.
 *
 * @param options - @see DirectoryUrlSyncOptions
 */
export function useDirectoryUrlSync({ queryString, requestedQueryString, adopt }: DirectoryUrlSyncOptions): void {
  /**
   * The query string this hook last wrote, or `undefined` before it has written one.
   *
   * This is the whole basis for telling the two cases apart. If the URL still reads exactly as this hook left it, then
   * nothing else has touched it and any disagreement must be the view moving on; if it reads as something else,
   * something outside this component moved it and the view is what needs to catch up.
   */
  const lastWritten: RefObject<string | undefined> = useRef<string | undefined>(undefined);

  /**
   * Deliberately run on every render rather than keyed to `queryString`: a soft navigation to a different view of the
   * same route changes the URL without changing any of the component's state, so an effect that only fired when the
   * state moved would never see it. The body is two string comparisons and returns immediately in the settled case,
   * which is almost every render.
   *
   * Writes use `history.replaceState` rather than a router navigation, and this is load-bearing rather than incidental
   * — a router navigation re-runs the route on the server, and doing that per keystroke would undo the entire point of
   * a directory that filters in the browser. `replace` rather than `push` likewise: typing seven letters should not
   * leave seven entries for the Back button to walk out of.
   *
   * Path and hash are read from `window.location` rather than rebuilt from a route constant, which keeps both the
   * static demo's `basePath` and the skip link's fragment intact without either being special-cased.
   */
  useEffect((): void => {
    const current: string = window.location.search;

    if (current === queryString) {
      // Already agreeing. Recording it still matters: it is what a later render compares against.
      lastWritten.current = queryString;
      return;
    }

    if (lastWritten.current === undefined) {
      lastWritten.current = current;

      // First reconciliation after mount. The route normally resolved this URL already, so props win. The exception is
      // a static export, which has no server at request time and so hands over the default view while the URL still
      // names a narrowed one — the one case where the URL is the better source, and the reason a shared link opens
      // narrowed on the GitHub Pages demo rather than quietly widening and erasing its own params.
      if (requestedQueryString.length === 0) adopt(current);
      return;
    }

    if (current === lastWritten.current) {
      // The URL is still exactly what this hook last wrote, so it is the view that moved on.
      window.history.replaceState(null, "", `${window.location.pathname}${queryString}${window.location.hash}`);
      lastWritten.current = queryString;
      return;
    }

    // Something else moved the URL: a navigation to another view of this route, or Back or Forward.
    lastWritten.current = current;
    adopt(current);
  });

  /**
   * Follows Back and Forward.
   *
   * A `popstate` restores a URL without re-rendering anything, so the reconciliation above would not otherwise run
   * until something else happened to re-render the component.
   */
  useEffect((): (() => void) => {
    function onPopState(): void {
      lastWritten.current = window.location.search;
      adopt(window.location.search);
    }

    window.addEventListener("popstate", onPopState);
    return (): void => window.removeEventListener("popstate", onPopState);
  }, [adopt]);
}
