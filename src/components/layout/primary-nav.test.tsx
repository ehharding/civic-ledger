/**
 * Covers PrimaryNav's destinations, the aria-current marking it derives from the open path, and the drawer the same
 * nav becomes below 640px.
 *
 * What jsdom can and cannot answer about that drawer is worth stating, because it decides what is asserted here and
 * what is left to `tests/e2e`. jsdom has no layout engine and applies none of this app's stylesheets, so *which* of
 * the two arrangements is in force is invisible to it — the panel is never actually off-screen, never actually
 * `visibility: hidden`, and the toggle is never actually `display: none`. What is testable here is the whole of the
 * component's own contract: what it marks open, what it locks, what it closes on, and where it puts focus. Whether the
 * drawer is *painted*, whether the closed panel leaves the tab order, and whether a destination clears the target-size
 * floor inside it are geometry, and they are pinned in `tests/e2e/layout.spec.ts` and `tests/e2e/navigation.spec.ts`.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { navCurrent, PrimaryNav } from "@/components/layout/primary-nav";

const pathnameMock = vi.fn<() => string | null>();

vi.mock("next/navigation", () => ({
  usePathname: (): string | null => pathnameMock(),
}));

/** The nav landmark, for the assertions below. */
function renderNavAt(pathname: string | null): HTMLElement {
  pathnameMock.mockReturnValue(pathname);
  render(<PrimaryNav />);

  return screen.getByRole("navigation", { name: "Primary navigation" });
}

describe("navCurrent", (): void => {
  it("claims the page only on the destination itself", (): void => {
    expect(navCurrent("/bills", "/bills")).toBe("page");
  });

  /*
   * The distinction this function exists for. On a bill's own page the current *page* is the bill, so the directory
   * link is the current item of a set rather than the document being read — announcing it as "current page" would put a
   * screen reader two levels away from where it says it is.
   */
  it("marks a section as the current item, not the current page, from inside it", (): void => {
    expect(navCurrent("/bills/119/hr/134", "/bills")).toBe(true);
    expect(navCurrent("/committees/house/hsag00", "/committees")).toBe(true);
  });

  it("leaves unrelated destinations unmarked", (): void => {
    expect(navCurrent("/members", "/bills")).toBeUndefined();
    expect(navCurrent("/", "/bills")).toBeUndefined();
  });

  /*
   * The descendant test is `${href}/` rather than `href`, so a route that merely starts with a destination's name is
   * not a route beneath it. Without the separator, `/billing` would light up "Bills".
   */
  it("does not treat a longer sibling route as a descendant", (): void => {
    expect(navCurrent("/billing", "/bills")).toBeUndefined();
  });

  /*
   * usePathname reads a router context and returns null when there is none, which is the case in every unit test that
   * renders the header directly. Marking nothing is the correct degradation; throwing would take the whole header out.
   */
  it("marks nothing when there is no router to read a path from", (): void => {
    expect(navCurrent(null, "/bills")).toBeUndefined();
  });
});

describe("PrimaryNav", (): void => {
  beforeEach((): void => {
    pathnameMock.mockReset();
  });

  it("renders the primary nav with the expected destinations", (): void => {
    const nav: HTMLElement = renderNavAt("/");

    expect(nav.querySelector('a[href="/bills"]')).toHaveTextContent("Bills");
    expect(nav.querySelector('a[href="/members"]')).toHaveTextContent("Members");
    expect(nav.querySelector('a[href="/committees"]')).toHaveTextContent("Committees");
    expect(nav.querySelector('a[href="/learn"]')).toHaveTextContent("Learn");
    expect(nav.querySelector('a[href="/about"]')).toHaveTextContent("Methodology");
  });

  /*
   * The nav's length is the thing that decides whether the header still fits on a phone — five destinations is what
   * moved it onto a row of its own below 640px. A sixth arriving without anyone revisiting that decision is exactly the
   * kind of change that ships looking fine on a laptop, so this asserts the count rather than only the members.
   */
  it("carries exactly the five primary destinations", (): void => {
    expect(renderNavAt("/").querySelectorAll("a")).toHaveLength(5);
  });

  it("marks the open section and only the open section", (): void => {
    const nav: HTMLElement = renderNavAt("/members");

    expect(nav.querySelector('a[href="/members"]')).toHaveAttribute("aria-current", "page");
    expect(nav.querySelectorAll("a[aria-current]")).toHaveLength(1);
  });

  it("keeps a section marked from a record page inside it", (): void => {
    const nav: HTMLElement = renderNavAt("/members/L000174");

    expect(nav.querySelector('a[href="/members"]')).toHaveAttribute("aria-current", "true");
  });

  /*
   * The home route is the wordmark's destination rather than a nav entry, so nothing in this row should claim it. An
   * `aria-current` on a "/" entry would also prefix-match every path on the site, which is the failure this guards.
   */
  it("marks nothing on the home page", (): void => {
    expect(renderNavAt("/").querySelectorAll("a[aria-current]")).toHaveLength(0);
  });

  /*
   * The attribute is omitted rather than rendered false, so the stylesheet can select on its presence alone.
   * @see the `.primary-nav a[aria-current]` rule in src/styles/layout.css.
   */
  it("omits the attribute on unmarked destinations rather than setting it false", (): void => {
    const nav: HTMLElement = renderNavAt("/bills");

    expect(nav.querySelector('a[href="/learn"]')).not.toHaveAttribute("aria-current");
  });
});

/**
 * The drawer, rendered open, with the handles every assertion below reaches for.
 *
 * @param pathname - The open path to report from `usePathname`.
 * @returns The toggle, the scrim, the nav landmark, and its last destination.
 */
function openDrawerAt(pathname: string | null): {
  toggle: HTMLElement;
  scrim: Element;
  nav: HTMLElement;
  lastLink: HTMLElement;
} {
  pathnameMock.mockReturnValue(pathname);
  const { container } = render(<PrimaryNav />);

  const toggle: HTMLElement = screen.getByRole("button", { name: "Menu" });
  fireEvent.click(toggle);

  const nav: HTMLElement = screen.getByRole("navigation", { name: "Primary navigation" });
  const links: NodeListOf<HTMLAnchorElement> = nav.querySelectorAll("a");
  const scrim: Element | null = container.querySelector(".nav-scrim");
  const lastLink: HTMLAnchorElement | undefined = links[links.length - 1];

  if (scrim === null) throw new Error("no .nav-scrim rendered");
  if (lastLink === undefined) throw new Error("the nav rendered no destinations");

  return { toggle, scrim, nav, lastLink };
}

describe("PrimaryNav drawer", (): void => {
  beforeEach((): void => {
    pathnameMock.mockReset();
  });

  it("starts closed and says so on the control that opens it", (): void => {
    pathnameMock.mockReturnValue("/");
    render(<PrimaryNav />);

    const toggle: HTMLElement = screen.getByRole("button", { name: "Menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "primary-nav");
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toHaveAttribute("id", "primary-nav");
  });

  /*
   * All three elements read the same state, because all three are drawn from it: the panel slides, the scrim fades, and
   * the toggle's bars become an ✕. A disagreement between them is a half-open drawer.
   */
  it("marks the panel, the scrim and the toggle with one open state", (): void => {
    const { toggle, scrim, nav } = openDrawerAt("/");

    // The toggle says it with `aria-expanded` alone; the other two have no ARIA attribute of their own to say it with.
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).not.toHaveAttribute("data-open");
    expect(scrim).toHaveAttribute("data-open", "true");
    expect(nav).toHaveAttribute("data-open", "true");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(scrim).toHaveAttribute("data-open", "false");
    expect(nav).toHaveAttribute("data-open", "false");
  });

  it("marks the page as locked while it is open and releases it on close", (): void => {
    const { toggle } = openDrawerAt("/");
    expect(document.body).toHaveAttribute("data-nav-open");

    fireEvent.click(toggle);
    expect(document.body).not.toHaveAttribute("data-nav-open");
  });

  /* An unmount with the drawer open would otherwise leave the page unable to scroll and nothing left to unlock it. */
  it("releases the page when it unmounts while open", (): void => {
    pathnameMock.mockReturnValue("/");
    const { unmount } = render(<PrimaryNav />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(document.body).toHaveAttribute("data-nav-open");

    unmount();

    expect(document.body).not.toHaveAttribute("data-nav-open");
  });

  /*
   * The default action is stopped because jsdom has no navigation to perform and says so on its own console — a line
   * that reports as a failure nowhere and is noise everywhere. What is under test is the handler, which has already
   * run by the time the default action would.
   */
  it("closes when a destination is chosen", (): void => {
    const { toggle, nav } = openDrawerAt("/");
    const stopNavigation = (event: Event): void => event.preventDefault();
    document.addEventListener("click", stopNavigation);

    fireEvent.click(nav.querySelectorAll("a")[0] as HTMLAnchorElement);
    document.removeEventListener("click", stopNavigation);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  /*
   * The case a destination's own click handler cannot see: the path moved without one being tapped — Back out of an
   * open drawer, or a link elsewhere on the page reached before it was dismissed.
   */
  it("closes when the path changes underneath it", (): void => {
    pathnameMock.mockReturnValue("/bills");
    const { rerender } = render(<PrimaryNav />);
    const toggle: HTMLElement = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    pathnameMock.mockReturnValue("/members");
    rerender(<PrimaryNav />);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when the scrim is tapped", (): void => {
    const { toggle, scrim } = openDrawerAt("/");

    fireEvent.click(scrim);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  /*
   * Above 640px there is no drawer, no scrim and no toggle to see, but this component's state would still say
   * "open" — and a Tab loop around a control the reader cannot find is the exact trap the loop exists to prevent. A
   * resize is the only way to leave the drawer layout.
   */
  it("closes when the window is resized out of the drawer layout", (): void => {
    const { toggle } = openDrawerAt("/");

    act((): void => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape and hands focus back to the toggle", (): void => {
    const { toggle, lastLink } = openDrawerAt("/");
    lastLink.focus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(toggle);
  });

  /*
   * Focus outside the panel is somewhere the reader put it deliberately — most often the toggle itself, which is where
   * a drawer opened by pointer leaves it. Pulling it anywhere on close would be this component overruling that.
   */
  it("leaves focus where it is when Escape arrives from outside the panel", (): void => {
    const { toggle } = openDrawerAt("/");
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(document.body);
  });

  it("ignores keys that are neither Escape nor Tab", (): void => {
    const { toggle } = openDrawerAt("/");

    fireEvent.keyDown(document, { key: "a" });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  /*
   * The two ends of the loop. It runs toggle → first destination → … → last destination → toggle, so a reader tabbing
   * through an open drawer stays inside it rather than walking into page content the scrim has covered.
   */
  it("loops Tab from the last destination back to the toggle", (): void => {
    const { toggle, lastLink } = openDrawerAt("/");
    lastLink.focus();

    fireEvent.keyDown(document, { key: "Tab" });

    expect(document.activeElement).toBe(toggle);
  });

  it("loops Shift+Tab from the toggle to the last destination", (): void => {
    const { toggle, lastLink } = openDrawerAt("/");
    toggle.focus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(lastLink);
  });

  /* Only the ends are caught; in the middle of the panel the browser's own tab order is left to do its job. */
  it("leaves Tab alone in the middle of the panel", (): void => {
    const { nav } = openDrawerAt("/");
    const firstLink: HTMLAnchorElement = nav.querySelectorAll("a")[0] as HTMLAnchorElement;
    firstLink.focus();

    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(firstLink);

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(firstLink);
  });

  /* The listeners come down with the drawer, rather than staying on the document waiting for a state that is gone. */
  it("stops answering Escape once it is closed", (): void => {
    const { toggle, lastLink } = openDrawerAt("/");
    fireEvent.click(toggle);
    lastLink.focus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(document.activeElement).toBe(lastLink);
  });
});
