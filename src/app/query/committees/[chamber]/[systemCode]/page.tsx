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
  params: CommitteeParams;
  searchParams: Promise<RouteSearchParams>;
};

/**
 * @param params - The committee's route params.
 * @returns The same metadata as the committee's own page, canonical path included. @see committeeMetadata
 */
export function generateMetadata({ params }: QueryCommitteePageProps): Promise<Metadata> {
  return committeeMetadata(params);
}

/**
 * A committee page with a `?records=`/`?page=` view, reached only through a rewrite. @see src/lib/query-routes.ts.
 *
 * @param params - The committee's route params.
 * @param searchParams - The record view. Reading it is what makes this render on demand.
 * @returns The committee page, showing the records the URL asked for.
 */
export default function QueryCommitteePage({ params, searchParams }: QueryCommitteePageProps): Promise<JSX.Element> {
  return renderCommitteeRoute(params, searchParams);
}
