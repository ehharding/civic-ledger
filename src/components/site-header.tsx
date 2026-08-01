import { Compass, Search } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
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
  { label: "Bills", href: "/bills" as Route },
  { label: "Members", href: "/members" as Route },
  { label: "Committees", href: "/committees" as Route },
  { label: "Learn", href: "/learn" as Route },
  { label: "Methodology", href: "/about" as Route },
];

/**
 * Global site header: wordmark, primary navigation, and search.
 *
 * The search control is a real `<form>` with `action="/bills"` rather than a JavaScript handler, so it works on a plain
 * page load, from any route, and in the static export — it simply navigates to `/bills?q=…`, which the directory reads
 * as its initial query. It carries `role="search"` so it is a landmark in its own right.
 * @see resolveBillDirectoryQuery
 *
 * @returns The site header.
 */
export function SiteHeader(): JSX.Element {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="wordmark" href="/" aria-label="Civic Ledger home">
          <span className="wordmark__mark">
            <Compass aria-hidden="true" size={18} strokeWidth={2.25} />
          </span>
          <span>Civic Ledger</span>
        </Link>
        <nav className="primary-nav" aria-label="Primary navigation">
          {NAV_LINKS.map(
            (link: NavLink): JSX.Element => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ),
          )}
        </nav>
        {/* biome-ignore lint/a11y/useSemanticElements: the suggested <search> element would have to wrap this form
            rather than replace it, and it is still mapped inconsistently by assistive technology; form[role="search"]
            is the spelling that produces the landmark everywhere. */}
        <form className="header-search" action="/bills" role="search">
          <label className="sr-only" htmlFor="global-search">
            Search bills
          </label>
          <Search aria-hidden="true" size={15} />
          <input id="global-search" name="q" placeholder="Search bills" type="search" />
        </form>
      </div>
    </header>
  );
}
