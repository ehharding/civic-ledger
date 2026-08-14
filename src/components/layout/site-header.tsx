import { Compass, Search } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";

import { PrimaryNav } from "@/components/layout/primary-nav";

/**
 * Where the header's search form submits.
 *
 * `basePath` is applied by `next/link` and the router, but not to a raw `action` attribute — and this control is a
 * plain form on purpose, so it is outside that rewriting and has to carry the prefix itself. Without this the GitHub
 * Pages demo's search box posts to `/bills` at the domain root and 404s. `NEXT_PUBLIC_BASE_PATH` is inlined at build
 * time from the same value `basePath` gets. @see next.config.ts
 */
const SEARCH_ACTION: string = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/bills`;

/**
 * Global site header: wordmark, primary navigation, and search.
 *
 * A server component, and the two halves either side of {@link PrimaryNav} are why it stays one: the wordmark is a
 * static link and the search is a plain `<form>`, so neither has any reason to be shipped to the browser. Only the nav
 * needs the open path, and only the nav crosses the boundary.
 *
 * The search control is a real `<form>` rather than a JavaScript handler, so it works on a plain page load, from any
 * route, and in the static export — it simply navigates to `/bills?q=…`, which the directory reads as its initial
 * query. It carries `role="search"` so it is a landmark in its own right.
 * @see resolveBillDirectoryQuery
 * @see SEARCH_ACTION for why the target is built rather than written literally.
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
        <PrimaryNav />
        {/* biome-ignore lint/a11y/useSemanticElements: the suggested <search> element would have to wrap this form
            rather than replace it, and it is still mapped inconsistently by assistive technology; form[role="search"]
            is the spelling that produces the landmark everywhere. */}
        <form className="header-search" action={SEARCH_ACTION} role="search">
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
