"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { JSX } from "react";

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
 * Five is where this list stops fitting beside the wordmark on a phone, which is why the header gives the nav a row of
 * its own below 640px rather than continuing to squeeze it. @see the header block in src/styles/responsive.css. A sixth
 * destination would fit that row too; a seventh would want a different pattern entirely, and this comment is the marker
 * for whoever gets there.
 */
const NAV_LINKS: readonly NavLink[] = [
  { label: "Bills", href: "/bills" },
  { label: "Members", href: "/members" },
  { label: "Committees", href: "/committees" },
  { label: "Learn", href: "/learn" },
  { label: "Methodology", href: "/about" },
];

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
 * The header's primary navigation, with the section the reader is currently inside marked as such.
 *
 * A client component only because knowing which destination is current means reading the open path, and
 * {@link usePathname} is a client hook — the links themselves are static. It is split out of {@link SiteHeader} rather
 * than pulling the whole header across the boundary so the wordmark and the search form stay server-rendered; the
 * search in particular is a plain no-JavaScript `<form>`, and there is no reason to ship it to the browser to give five
 * links an active state.
 *
 * The marking is carried by `aria-current` alone, with no parallel `is-current` class, for the reason the committee
 * record tabs already state: the attribute is what holds the meaning, so it should be what the stylesheet selects on
 * rather than a second answer to the same question. @see the `.primary-nav a[aria-current]` rule in
 * src/styles/layout.css, which is deliberately keyed to the attribute's *presence* so both values it can take are
 * styled the same — the distinction between them is for assistive technology, not for the eye.
 *
 * @returns The primary navigation landmark.
 */
export function PrimaryNav(): JSX.Element {
  const pathname: string | null = usePathname();

  return (
    <nav className="primary-nav" aria-label="Primary navigation">
      {NAV_LINKS.map(
        (link: NavLink): JSX.Element => (
          <Link aria-current={navCurrent(pathname, link.href)} href={link.href} key={link.href}>
            {link.label}
          </Link>
        ),
      )}
    </nav>
  );
}
