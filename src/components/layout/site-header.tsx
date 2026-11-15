import { Compass, Search } from "lucide-react";
import Link from "next/link";
import type { JSX } from "react";

import { PrimaryNav } from "@/components/layout/primary-nav";
import { BILL_DIRECTORY_PARAMS } from "@/lib/congress/bills/search";
import { SITE_NAME } from "@/lib/metadata";

/**
 * Where the header's search form submits. A raw `action` doesn't get `basePath`, so it's prefixed by hand for the
 * GitHub Pages demo.
 * @see next.config.ts
 */
const SEARCH_ACTION: string = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/bills`;

/**
 * Global site header: wordmark, primary navigation, and search. A server component; only {@link PrimaryNav} is a client
 * component. The search is a plain `<form role="search">` GET to `/bills?q=…`, so it works without JavaScript and in
 * the static export; its field name comes from {@link BILL_DIRECTORY_PARAMS}, the same constant the directory reads.
 *
 * @returns The site header.
 */
export function SiteHeader(): JSX.Element {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="wordmark" href="/" aria-label={`${SITE_NAME} home`}>
          <span className="wordmark__mark">
            <Compass aria-hidden="true" size={18} strokeWidth={2.25} />
          </span>
          <span>{SITE_NAME}</span>
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
          <input id="global-search" name={BILL_DIRECTORY_PARAMS.query} placeholder="Search bills" type="search" />
        </form>
      </div>
    </header>
  );
}
