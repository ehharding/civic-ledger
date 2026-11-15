import type { Metadata } from "next";
import type { JSX } from "react";

import {
  type CongressBillsParams,
  congressBillsMetadata,
  renderCongressBillsRoute,
} from "@/app/bills/[congress]/render";
import type { RouteSearchParams } from "@/lib/search-params";

/** Params for the query-carrying twin of `/bills/[congress]`. */
type QueryCongressBillsPageProps = {
  params: CongressBillsParams;
  searchParams: Promise<RouteSearchParams>;
};

/**
 * @param params - The route's `congress` param.
 * @returns The same metadata as `/bills/[congress]`, canonical path included.
 * @see congressBillsMetadata
 */
export function generateMetadata({ params }: QueryCongressBillsPageProps): Promise<Metadata> {
  return congressBillsMetadata(params);
}

/**
 * `/bills/[congress]` with a `?q=` or `?stage=` deep link, reached only through a rewrite.
 *
 * @param params - The route's `congress` param.
 * @param searchParams - The deep link. Reading it is what makes this render on demand.
 * @returns The directory page for that Congress, narrowed to whatever the URL asked for.
 * @see src/lib/query-routes.ts
 */
export default function QueryCongressBillsPage({
  params,
  searchParams,
}: QueryCongressBillsPageProps): Promise<JSX.Element> {
  return renderCongressBillsRoute(params, searchParams);
}
