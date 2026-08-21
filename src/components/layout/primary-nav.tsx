"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type JSX, type RefObject, useCallback, useEffect, useRef, useState } from "react";

/** One primary navigation destination. */
type NavLink = {
  label: string;
  href: Route;
};

/**
 * Primary navigation, in the order the site is meant to be understood: the records first, then the people behind them,
 * then the rooms those records pass through, then how to read all three, then how they were gathered.
 *
 * "Committees" sits after "Members" rather than beside "Bills" because it is only legible once a reader knows who is in
 * one — the page itself is about bodies of people, and its whole purpose is to give the referral line on a bill page
 * somewhere to lead.
 *
 * Five is what fits beside the wordmark on a laptop, and the list is no longer bounded by what fits on a phone: below
 * 640px these become a drawer, which is a column and takes a sixth or a tenth destination without rearranging anything.
 * What *is* still bounded is the row above that breakpoint — a sixth label there would start crowding the search box at
 * the widths where both are still shown. @see the derivation above the 860px breakpoint in src/styles/responsive.css.
 */
const NAV_LINKS: readonly NavLink[] = [
  { label: "Bills", href: "/bills" },
  { label: "Members", href: "/members" },
  { label: "Committees", href: "/committees" },
  { label: "Learn", href: "/learn" },
  { label: "Methodology", href: "/about" },
];

/** The nav landmark's id, which is also what the toggle's `aria-controls` points at. */
const PRIMARY_NAV_ID: string = "primary-nav";

/**
 * What `aria-current` a destination should carry, given the path currently open.
 *
 * Two values rather than one, because this nav names *sections* and a reader is usually somewhere inside one rather
 * than on its front page. `"page"` is the literal claim that this link points at the document you are reading, and it
 * is only true on `/bills` itself; on `/bills/119/hr/134` the current page is the bill, not the directory. Saying
 * `"page"` there would have a screen reader announce "Bills, current page" while the reader is two levels below it.
 * `true` is ARIA's answer for exactly that case — the current item of a set, without the claim about which
 * document — so a section link wears it whenever the open path sits underneath it.
 *
 * Descendants are matched on `${href}/` rather than on `href` alone so a future `/billing` route could never light up
 * "Bills". The home route is deliberately not a destination here (the wordmark is its link), which is also what keeps a
 * bare `"/"` out of this comparison, where it would prefix-match every path on the site.
 *
 * @param pathname - The open path, from {@link usePathname}. Nullable because that hook reads a router context and
 *   returns `null` when there isn't one — which is every unit test that renders the header directly. A nav with no
 *   router should simply mark nothing current rather than take the header down with it.
 * @param href - The destination to judge.
 * @returns `"page"` on the destination itself, `true` anywhere beneath it, and `undefined` otherwise — the last so the
 *   attribute is omitted entirely rather than rendered as `aria-current="false"`.
 */
export function navCurrent(pathname: string | null, href: string): "page" | true | undefined {
  if (pathname === null) return undefined;
  if (pathname === href) return "page";

  return pathname.startsWith(`${href}/`) ? true : undefined;
}

/**
 * The header's primary navigation: a row of links on a laptop, a slide-out drawer on a phone.
 *
 * **One nav, two layouts, no second copy of the links.** The `<nav>` below is the same element in both
 * arrangements — below 640px the stylesheet takes it out of flow, parks it off the right edge, and slides it back in
 * when the toggle says so. The alternative most sites reach for is a second markup block for small screens, which puts
 * two landmarks with the same accessible name in the document, doubles the destination list, and gives every test that
 * asks for "the primary navigation" two answers. The drawer here is a *presentation* of the one nav, so nothing
 * downstream — the `aria-current` marking, the e2e journeys, the target-size sweep — has to learn about the breakpoint.
 *
 * **Which layout is in force is decided in CSS, not here, and that is load-bearing.** This component knows only that
 * the drawer is open or closed; it never asks how wide the window is. What that buys is that the closed state is
 * expressed as `visibility: hidden` inside the drawer's own media query, so the links leave the tab order and the
 * accessibility tree exactly where the drawer exists and nowhere else. A React-side `inert` or `hidden` on the panel
 * would have to know the breakpoint to avoid hiding the desktop row, and would be wrong for the whole window between a
 * resize and the next render.
 *
 * **Without JavaScript the drawer does not exist, and the nav is unchanged.** The toggle and the drawer layout are
 * scoped to `@media (scripting: enabled)`, so a browser with scripting off keeps the wrapped row this header had
 * before — no button that does nothing, no five links behind a control that cannot open. That is the same commitment
 * the header's search form and the glossary bubble already make: a reader should reach what a page points at whatever
 * is or isn't running. @see the drawer block in src/styles/responsive.css.
 *
 * **It is a disclosure, not a modal.** The panel keeps the `navigation` landmark rather than becoming a
 * `role="dialog"`, and the toggle carries `aria-expanded`/`aria-controls` — the pattern for a control that reveals
 * content that follows it. Focus is deliberately *not* moved on opening: the panel is the toggle's next sibling in the
 * DOM, so the next Tab already lands on the first destination, and a reader who opened the menu by pointer is not
 * yanked anywhere. What the drawer does borrow from a dialog is the Tab loop, because it comes with a scrim: without
 * it, tabbing past the last destination walks into page content the reader can no longer see. Escape closes it, and
 * closing hands focus back to the toggle whenever it was inside the panel — anywhere else, focus is somewhere the
 * reader put it deliberately and is left alone.
 *
 * The current-section marking is carried by `aria-current` alone, with no parallel `is-current` class, for the reason
 * the committee record tabs already state: the attribute is what holds the meaning, so it should be what the stylesheet
 * selects on rather than a second answer to the same question. @see the `.primary-nav a[aria-current]` rule in
 * src/styles/layout.css, which is deliberately keyed to the attribute's *presence* so both values it can take are
 * styled the same — the distinction between them is for assistive technology, not for the eye.
 *
 * A client component only because of the above, plus knowing which destination is current, which means reading the
 * open path through {@link usePathname}. It is split out of {@link SiteHeader} rather than pulling the whole header
 * across the boundary so the wordmark and the search form stay server-rendered.
 *
 * @returns The drawer toggle, its scrim, and the primary navigation landmark — three siblings of the header's grid, so
 *   the header can lay them out without a wrapper that would have to be undone at every breakpoint.
 */
export function PrimaryNav(): JSX.Element {
  const pathname: string | null = usePathname();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const toggleRef: RefObject<HTMLButtonElement | null> = useRef<HTMLButtonElement | null>(null);
  const navRef: RefObject<HTMLElement | null> = useRef<HTMLElement | null>(null);

  /**
   * Closes the drawer, and takes focus back to the toggle if it was inside the panel.
   *
   * The conditional is the whole of it. Restoring unconditionally would fight the two closes that are *not* a
   * dismissal — a destination being chosen, and a soft navigation arriving from elsewhere — by pulling focus out of the
   * page the reader just asked for and onto a hamburger button. Restoring never would leave focus on an element the
   * stylesheet has just made `visibility: hidden`, which browsers resolve by dropping it to `<body>`: the reader's next
   * Tab starts the page over from the skip link.
   */
  const closeMenu: () => void = useCallback((): void => {
    setIsOpen(false);

    const nav: HTMLElement | null = navRef.current;
    const toggle: HTMLButtonElement | null = toggleRef.current;
    /* v8 ignore start -- both elements are rendered unconditionally, so their refs are set whenever this can run. */
    if (nav === null || toggle === null) return;
    /* v8 ignore stop */

    if (nav.contains(document.activeElement)) toggle.focus();
  }, []);

  /*
   * A soft navigation closes the drawer, whoever caused it.
   *
   * The destinations close it themselves on click, which is what handles the one case this cannot see: tapping the
   * section you are already in leaves the path exactly as it was, so an effect keyed on it never runs. This covers
   * everything else — Back and Forward out of an open drawer, and any link elsewhere on the page that a reader reaches
   * before the drawer is dismissed.
   *
   * The suppression below is that sentence in the linter's terms: the effect is keyed on the path without reading it,
   * which is the one shape `useExhaustiveDependencies` cannot tell apart from a stale dependency left behind. Removing
   * it as the rule suggests would leave an effect that closes the drawer once, on mount, and never again.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is what this is keyed on, not what it reads.
  useEffect((): void => setIsOpen(false), [pathname]);

  /*
   * The page behind the drawer does not scroll while it is open.
   *
   * Marked on `<body>` rather than acted on here, so the rule can be scoped to the media query the drawer actually
   * exists in — a reader who opens the drawer and then rotates a tablet into the row layout gets their scrolling back
   * from the stylesheet, without this component having to hold an opinion about the viewport. @see responsive.css.
   */
  useEffect((): (() => void) => {
    document.body.toggleAttribute("data-nav-open", isOpen);

    return (): void => document.body.removeAttribute("data-nav-open");
  }, [isOpen]);

  /*
   * Everything that only applies while the drawer is open: Escape, the Tab loop, and closing on a resize.
   *
   * The listener is on the document rather than on the panel because Escape has to be heard wherever focus is — a
   * drawer opened by tapping the toggle leaves focus on a button outside the panel, and a handler bound inside it would
   * never fire. The same is true of the Tab loop's backwards half, which triggers on the toggle.
   *
   * The resize close is what keeps the loop honest across a breakpoint. Above 640px there is no drawer, no scrim, and
   * no toggle to see — but this component's state would still say "open", and a Tab loop around an element the reader
   * cannot find is the exact trap the loop exists to prevent. A resize is the only way to leave the drawer layout, so
   * it is the only thing that has to be listened for.
   */
  useEffect((): (() => void) | undefined => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        closeMenu();
        return;
      }

      if (event.key !== "Tab") return;

      const toggle: HTMLButtonElement | null = toggleRef.current;
      const nav: HTMLElement | null = navRef.current;
      /* v8 ignore start -- both elements render unconditionally, so their refs are set once a key can reach here. */
      if (toggle === null || nav === null) return;
      /* v8 ignore stop */

      const lastLink: HTMLAnchorElement | null = nav.querySelector<HTMLAnchorElement>("a:last-of-type");
      /* v8 ignore start -- NAV_LINKS is never empty, so the panel always has a last destination. */
      if (lastLink === null) return;
      /* v8 ignore stop */

      // The loop runs toggle → first destination → … → last destination → toggle, so only its two ends need catching.
      if (event.shiftKey && document.activeElement === toggle) {
        event.preventDefault();
        lastLink.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === lastLink) {
        event.preventDefault();
        toggle.focus();
      }
    }

    function onResize(): void {
      setIsOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);

    return (): void => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [isOpen, closeMenu]);

  const openState: "true" | "false" = isOpen ? "true" : "false";

  return (
    <>
      {/* No `data-open` here, unlike the two elements below: `aria-expanded` already says this, so the stylesheet
          selects on that instead. Same rule the current-section marking follows — where an ARIA attribute carries the
          state, a parallel attribute would be a second answer to one question and a second thing to keep in step. The
          scrim and the panel have no such attribute of their own, which is why they do carry one. */}
      <button
        aria-controls={PRIMARY_NAV_ID}
        aria-expanded={isOpen}
        aria-label="Menu"
        className="nav-toggle"
        onClick={(): void => {
          if (isOpen) closeMenu();
          else setIsOpen(true);
        }}
        ref={toggleRef}
        type="button"
      >
        {/* Three bars rather than a lucide <Menu/> swapped for an <X/>, which is the one thing an icon pair cannot do:
            the bars are the same three elements in both states, so the browser can interpolate between them and the
            control reads as one thing changing rather than two things replacing each other. Decorative — the button's
            name and its `aria-expanded` carry everything a screen reader needs. */}
        <span aria-hidden="true" className="nav-toggle__bars">
          <span />
          <span />
          <span />
        </span>
      </button>
      {/* Dismissing by tapping outside is a pointer affordance sitting on top of two that are not — the toggle, which
          is a real button drawn as an ✕ while the drawer is open, and Escape. So this carries no role and no name: a
          third "close" in the tab order would add no capability and have nothing useful to announce, which is what
          `aria-hidden` says here. It is also why the rules about interactive elements do not fire on it. */}
      <div aria-hidden="true" className="nav-scrim" data-open={openState} onClick={closeMenu} />
      <nav
        aria-label="Primary navigation"
        className="primary-nav"
        data-open={openState}
        id={PRIMARY_NAV_ID}
        ref={navRef}
      >
        {NAV_LINKS.map(
          (link: NavLink): JSX.Element => (
            <Link
              aria-current={navCurrent(pathname, link.href)}
              href={link.href}
              key={link.href}
              onClick={(): void => setIsOpen(false)}
            >
              {link.label}
            </Link>
          ),
        )}
      </nav>
    </>
  );
}
