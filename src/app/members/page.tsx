import type { Metadata } from "next";
import type { JSX } from "react";

import { MEMBERS_METADATA, renderMembersRoute } from "@/app/members/render";
import { NO_SEARCH_PARAMS } from "@/lib/search-params";

/**
 * The route segment's data-cache window, declared as on `/bills` and `/committees` so all three directories state the
 * same thing about themselves. This route never reads its query, so it is prerendered and regenerated at most once per
 * window. A URL carrying one of the directory's params is rewritten to `/query/members` instead, which renders on
 * demand. @see src/lib/query-routes.ts.
 */
export const revalidate: number = 300;

export const metadata: Metadata = MEMBERS_METADATA;

/**
 * Member directory route, in its default view.
 *
 * @returns The unfiltered directory page. @see renderMembersRoute
 */
export default function MembersPage(): Promise<JSX.Element> {
  return renderMembersRoute(NO_SEARCH_PARAMS);
}
