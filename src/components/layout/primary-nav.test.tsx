/** Covers PrimaryNav's destinations and the aria-current marking it derives from the open path. */
import { render, screen } from "@testing-library/react";
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
