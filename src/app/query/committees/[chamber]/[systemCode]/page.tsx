import type { Metadata } from "next";
import type { JSX } from "react";

import {
  type CommitteeParams,
  committeeMetadata,
  renderCommitteeRoute,
} from "@/app/committees/[chamber]/[systemCode]/render";
import type { RouteSearchParams } from "@/lib/search-params";

/** Params for the query-carrying twin of `/committees/[chamber]/[systemCode]`. */
type QueryCommitteePageProps = {
  /** The dynamic segments, as Next hands them over. */
  params: CommitteeParams;
  /** The query string, read only by this on-demand twin. */
  searchParams: Promise<RouteSearchParams>;
};

/**
 * @param props - {@link QueryCommitteePageProps}.
 * @returns The same metadata as the committee's own page, canonical path included.
 * @see committeeMetadata
 */
export function generateMetadata({ params }: QueryCommitteePageProps): Promise<Metadata> {
  return committeeMetadata(params);
}

/**
 * A committee page with a `?records=`/`?page=` view, reached only through a rewrite.
 *
 * @param props - {@link QueryCommitteePageProps}.
 * @returns The committee page, showing the records the URL asked for.
 * @see src/lib/query-routes.ts
 */
export default function QueryCommitteePage({ params, searchParams }: QueryCommitteePageProps): Promise<JSX.Element> {
  return renderCommitteeRoute(params, searchParams);
}
