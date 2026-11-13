import type { Metadata } from "next";
import type { JSX } from "react";

import { COMMITTEES_METADATA, renderCommitteesRoute } from "@/app/committees/render";
import { NO_SEARCH_PARAMS } from "@/lib/search-params";

/**
 * The route segment's data-cache window. This route never reads its query, so it is prerendered and regenerated at most
 * once per window. A URL carrying one of the directory's params is rewritten to `/query/committees` instead, which
 * renders on demand. @see src/lib/query-routes.ts.
 */
export const revalidate: number = 300;

export const metadata: Metadata = COMMITTEES_METADATA;

/**
 * Committee directory route, in its default view.
 *
 * @returns The unfiltered directory page. @see renderCommitteesRoute
 */
export default function CommitteesPage(): Promise<JSX.Element> {
  return renderCommitteesRoute(NO_SEARCH_PARAMS);
}
