import { Compass, Search } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";

/** Primary navigation links shown in the site header. */
const nav = [
  ["Bills", "/bills"],
  ["Learn", "/learn"],
  ["Methodology", "/about"],
] as const;

/** Global site header: wordmark, primary nav, and a search form that submits `q` to /bills (see resolveInitialQuery). */
export function SiteHeader(): JSX.Element {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="wordmark" href="/" aria-label="Civic Ledger Home">
          <span className="wordmark__mark">
            <Compass aria-hidden="true" size={18} strokeWidth={2.25} />
          </span>
          <span>Civic Ledger</span>
        </Link>
        <nav className="primary-nav" aria-label="Primary Navigation">
          {nav.map(([label, href]) => (
            <Link href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
        <form className="header-search" action="/bills">
          <label className="sr-only" htmlFor="global-search">
            Search Bills
          </label>
          <Search aria-hidden="true" size={15} />
          <input id="global-search" name="q" placeholder="Search Bills" type="search" />
        </form>
      </div>
    </header>
  );
}
