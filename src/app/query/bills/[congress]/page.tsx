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
  /** The dynamic segments, as Next hands them over. */
  params: CongressBillsParams;
  /** The query string, read only by this on-demand twin. */
  searchParams: Promise<RouteSearchParams>;
};

/**
 * @param props - {@link QueryCongressBillsPageProps}.
 * @returns The same metadata as `/bills/[congress]`, canonical path included.
 * @see congressBillsMetadata
 */
export function generateMetadata({ params }: QueryCongressBillsPageProps): Promise<Metadata> {
  return congressBillsMetadata(params);
}

/**
 * `/bills/[congress]` with a `?q=` or `?stage=` deep link, reached only through a rewrite.
 *
 * @param props - {@link QueryCongressBillsPageProps}.
 * @returns The directory page for that Congress, narrowed to whatever the URL asked for.
 * @see src/lib/query-routes.ts
 */
export default function QueryCongressBillsPage({
  params,
  searchParams,
}: QueryCongressBillsPageProps): Promise<JSX.Element> {
  return renderCongressBillsRoute(params, searchParams);
}
