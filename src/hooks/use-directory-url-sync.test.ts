/**
 * Covers useDirectoryUrlSync's reconciliation directly, rather than only incidentally through the three directories
 * that use it.
 *
 * This hook exists because "the reader narrowed something" and "the URL changed underneath us" are indistinguishable
 * from inside a render and need opposite responses — one rewrites the URL, the other rewrites the state. Getting that
 * backwards is not a hypothetical: the hook's own documentation records the bug it was written to fix, where following
 * the header's "Bills" link from an already-narrowed directory appeared to do nothing because the component wrote its
 * stale query string back over the URL the router had just set.
 *
 * So the cases below are organized around which way the reconciliation should fall, and each asserts *both* halves —
 * that the right thing happened and that the wrong one didn't. A test that only checked `adopt` was called would still
 * pass if the hook also clobbered the URL on its way there.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type Mock, type MockInstance, vi } from "vitest";

import { useDirectoryUrlSync } from "@/hooks/use-directory-url-sync";

type SyncProps = {
  queryString: string;
  requestedQueryString: string;
};

const PATH: string = "/members";

/**
 * The real `history.replaceState`, captured before any spy can wrap it.
 *
 * The tests below both drive the address bar and assert on the hook's writes to it, and those are the same function.
 * Setting up a URL through the spy would count as a call the hook never made, so every "did the hook write?" assertion
 * would be measuring the test's own setup.
 */
const nativeReplaceState: typeof window.history.replaceState = window.history.replaceState.bind(window.history);

/** Points the address bar at `url` without going through the hook, i.e., the way a router or the reader would. */
function setUrl(url: string): void {
  nativeReplaceState(null, "", url);
}

let adopt: Mock<(search: string) => void>;
let replaceState: MockInstance<typeof window.history.replaceState>;

function renderSync(initialProps: SyncProps) {
  return renderHook(
    ({ queryString, requestedQueryString }: SyncProps): void =>
      useDirectoryUrlSync({ queryString, requestedQueryString, adopt }),
    { initialProps },
  );
}

beforeEach((): void => {
  // The address bar is shared state across a file's tests, so each one starts from a known, unnarrowed URL.
  setUrl(PATH);
  // A single stable mock: the hook registers it as a `popstate` listener, so a fresh identity per render would
  // silently re-register and mask a missing dependency.
  adopt = vi.fn();
  replaceState = vi.spyOn(window.history, "replaceState");
});

afterEach((): void => {
  replaceState.mockRestore();
});

describe("useDirectoryUrlSync", (): void => {
  describe("on mount", (): void => {
    it("does nothing when the URL already says what the view is showing", (): void => {
      setUrl(`${PATH}?party=democratic`);

      renderSync({ queryString: "?party=democratic", requestedQueryString: "?party=democratic" });

      expect(adopt).not.toHaveBeenCalled();
      expect(replaceState).not.toHaveBeenCalled();
    });

    it("lets the server's resolved view win over the address bar", (): void => {
      // The route already read this URL and resolved it into props, so props are the newer truth. Adopting the URL
      // here would be redundant at best, and at worst would fight the render that just happened.
      setUrl(`${PATH}?party=democratic`);

      renderSync({ queryString: "?party=democratic&sort=state", requestedQueryString: "?party=democratic&sort=state" });

      expect(adopt).not.toHaveBeenCalled();
      expect(replaceState).not.toHaveBeenCalled();
    });

    it("adopts the URL when no server resolved it — the static-export case", (): void => {
      // An empty `requestedQueryString` means the route resolved nothing, which is how a static export is recognized:
      // there is no server at request time, so the URL is the only place the reader's intent survives. This is what
      // makes a shared link open narrowed on the GitHub Pages demo instead of quietly widening and erasing its params.
      setUrl(`${PATH}?party=republican&sort=state`);

      renderSync({ queryString: "", requestedQueryString: "" });

      expect(adopt).toHaveBeenCalledExactlyOnceWith("?party=republican&sort=state");
      expect(replaceState).not.toHaveBeenCalled();
    });

    it("does not adopt an unnarrowed URL that already agrees, even in a static export", (): void => {
      renderSync({ queryString: "", requestedQueryString: "" });

      expect(adopt).not.toHaveBeenCalled();
      expect(replaceState).not.toHaveBeenCalled();
    });
  });

  describe("when the reader narrows the view", (): void => {
    it("writes the new view back to the address bar", (): void => {
      setUrl(`${PATH}?party=democratic`);
      const { rerender } = renderSync({
        queryString: "?party=democratic",
        requestedQueryString: "?party=democratic",
      });

      rerender({ queryString: "?party=republican", requestedQueryString: "?party=democratic" });

      expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, "", `${PATH}?party=republican`);
      expect(adopt).not.toHaveBeenCalled();
      expect(window.location.search).toBe("?party=republican");
    });

    it("replaces rather than pushes, so typing does not fill the Back button", (): void => {
      const before: number = window.history.length;

      setUrl(`${PATH}?q=broad`);
      const { rerender } = renderSync({ queryString: "?q=broad", requestedQueryString: "?q=broad" });

      for (const query of ["?q=broadb", "?q=broadba", "?q=broadband"]) {
        rerender({ queryString: query, requestedQueryString: "?q=broad" });
      }

      expect(window.location.search).toBe("?q=broadband");
      expect(window.history.length).toBe(before);
    });

    it("preserves the path and the skip link's fragment", (): void => {
      // Read from `window.location` rather than rebuilt from a route constant, which is what keeps both the static
      // demo's basePath and the in-page fragment intact without either being special-cased.
      setUrl("/civic-ledger/members?party=democratic#main-content");
      const { rerender } = renderSync({
        queryString: "?party=democratic",
        requestedQueryString: "?party=democratic",
      });

      rerender({ queryString: "?sort=state", requestedQueryString: "?party=democratic" });

      expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, "", "/civic-ledger/members?sort=state#main-content");
    });

    it("writes an empty query string when the view is cleared back to showing everything", (): void => {
      setUrl(`${PATH}?party=democratic`);
      const { rerender } = renderSync({
        queryString: "?party=democratic",
        requestedQueryString: "?party=democratic",
      });

      rerender({ queryString: "", requestedQueryString: "?party=democratic" });

      expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, "", PATH);
      expect(window.location.search).toBe("");
    });
  });

  describe("when the URL moves underneath the view", (): void => {
    it("adopts a navigation to another view of the same route instead of overwriting it", (): void => {
      // This is the regression the hook was written for: the header's own "Bills"/"Members" link, followed from an
      // already-narrowed directory. The component's state is stale, the router's URL is current, and writing the
      // former over the latter is what made the link appear to do nothing.
      setUrl(`${PATH}?party=democratic`);
      const { rerender } = renderSync({
        queryString: "?party=democratic",
        requestedQueryString: "?party=democratic",
      });

      setUrl(PATH);
      rerender({ queryString: "?party=democratic", requestedQueryString: "?party=democratic" });

      expect(adopt).toHaveBeenCalledExactlyOnceWith("");
      expect(replaceState).not.toHaveBeenCalled();
    });

    it("follows Back and Forward", (): void => {
      setUrl(`${PATH}?party=democratic`);
      renderSync({ queryString: "?party=democratic", requestedQueryString: "?party=democratic" });

      // A popstate restores a URL without re-rendering anything, so without its own listener the reconciliation above
      // would not run until something else happened to re-render the component.
      setUrl(`${PATH}?party=republican`);
      act((): void => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(adopt).toHaveBeenCalledExactlyOnceWith("?party=republican");
      expect(replaceState).not.toHaveBeenCalled();
    });

    it("does not keep adopting the same URL once the view has caught up", (): void => {
      setUrl(`${PATH}?party=democratic`);
      const { rerender } = renderSync({
        queryString: "?party=democratic",
        requestedQueryString: "?party=democratic",
      });

      setUrl(`${PATH}?sort=state`);
      rerender({ queryString: "?party=democratic", requestedQueryString: "?party=democratic" });
      expect(adopt).toHaveBeenCalledTimes(1);

      // The directory has now parsed that URL into its own state, so the two agree and the hook should settle.
      rerender({ queryString: "?sort=state", requestedQueryString: "?party=democratic" });
      rerender({ queryString: "?sort=state", requestedQueryString: "?party=democratic" });

      expect(adopt).toHaveBeenCalledTimes(1);
      expect(replaceState).not.toHaveBeenCalled();
    });

    it("stops listening for popstate once unmounted", (): void => {
      renderSync({ queryString: "", requestedQueryString: "" }).unmount();

      setUrl(`${PATH}?party=republican`);
      act((): void => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(adopt).not.toHaveBeenCalled();
    });
  });
});
