import { type RefObject, useEffect, useRef } from "react";

/** Options for {@link useDirectoryUrlSync}. */
type DirectoryUrlSyncOptions = {
  /**
   * The query string for what the directory is showing, leading `?` included, or `""` for an unnarrowed view — from the
   * directory's own serializer (`memberDirectoryQueryString` and friends).
   */
  queryString: string;
  /** The query string for the view the *server* resolved. Empty means a static export, which resolves nothing. */
  requestedQueryString: string;
  /**
   * Parses a URL's query string into the component's state, with the same parser the server uses. Must be stable
   * (`useCallback`), since the `popstate` listener is registered against it.
   */
  adopt: (search: string) => void;
};

/**
 * Keeps a directory's address bar and its visible view agreeing, in whichever direction is out of date, so any view can
 * be shared as a link.
 *
 * "The reader narrowed something" and "the URL changed underneath us" (e.g., the header's "Bills" link from a narrowed
 * directory) look the same inside a render but need opposite responses. Remembering what this hook last wrote tells
 * them apart.
 *
 * @param options - @see DirectoryUrlSyncOptions
 */
export function useDirectoryUrlSync({ queryString, requestedQueryString, adopt }: DirectoryUrlSyncOptions): void {
  /**
   * The query string this hook last wrote, or `undefined` before it has written one. If the URL still matches it, the
   * view moved on; otherwise something outside moved the URL and the view must catch up.
   */
  const lastWritten: RefObject<string | undefined> = useRef<string | undefined>(undefined);

  /*
   * Runs every render (a soft navigation changes the URL without changing state); the settled case is two string
   * comparisons. Writes with `history.replaceState`: a router navigation would re-run the route on the server per
   * keystroke, and `push` would fill the Back stack. Path and hash come from `window.location`, preserving the static
   * demo's `basePath` and the skip link's fragment.
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

      // First reconciliation after mount: props win, since the route resolved this URL — except in a static export,
      // which resolves nothing, so the URL is adopted instead.
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

  // Follows Back and Forward, which restore a URL without re-rendering.
  useEffect((): (() => void) => {
    function onPopState(): void {
      lastWritten.current = window.location.search;
      adopt(window.location.search);
    }

    window.addEventListener("popstate", onPopState);
    return (): void => window.removeEventListener("popstate", onPopState);
  }, [adopt]);
}
