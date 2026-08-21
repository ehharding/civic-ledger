/**
 * Covers the request half of this app's own API contract: the param names, and the two URL builders that write them.
 *
 * The assertions here are deliberately *round trips* rather than string comparisons. What these builders promise is not
 * a particular spelling — it is that what the browser writes, the handler reads back unchanged. That is a promise with
 * two ends in two runtimes, and pinning only the string would leave the half that matters untested: a query encoded one
 * way and decoded another produces a URL that looks perfect in a network panel and searches for the wrong thing.
 *
 * So each case builds a URL, parses it exactly as the route handler does — `new URL(request.url).searchParams` — and
 * hands the result to the same parser in `api-query.ts` the handler uses. A change to either side that breaks the other
 * fails here, which is the whole reason the param names stopped being string literals in four places.
 */
import { describe, expect, it } from "vitest";

import { BILL_API_PARAMS, billPageRequestUrl, billSearchRequestUrl } from "@/lib/api-contract";
import { MAX_QUERY_LENGTH, parseCongressQueryParam, parseOffsetParam, parseQueryParam } from "@/lib/api-query";

/** Reads a built request URL the way a route handler does, against an arbitrary origin it never sees. */
function paramsOf(requestUrl: string): URLSearchParams {
  return new URL(requestUrl, "https://civic-ledger.test").searchParams;
}

describe("billPageRequestUrl", (): void => {
  it("addresses the bill page route", (): void => {
    expect(billPageRequestUrl(24)).toBe("/api/bills?offset=24");
  });

  it("round-trips the offset through the handler's own parser", (): void => {
    expect(parseOffsetParam(paramsOf(billPageRequestUrl(24)).get(BILL_API_PARAMS.offset))).toBe(24);
  });

  it("round-trips a scoped Congress", (): void => {
    const params: URLSearchParams = paramsOf(billPageRequestUrl(0, 118));

    expect(parseOffsetParam(params.get(BILL_API_PARAMS.offset))).toBe(0);
    expect(parseCongressQueryParam(params.get(BILL_API_PARAMS.congress))).toBe(118);
  });

  it("omits the Congress entirely when the caller has none, rather than writing an empty param", (): void => {
    // The `/bills` route passes nothing here because the handler already defaults to the seated Congress. Writing
    // `congress=` instead would be a URL that says something, and says it wrong.
    expect(paramsOf(billPageRequestUrl(12)).has(BILL_API_PARAMS.congress)).toBe(false);
  });
});

describe("billSearchRequestUrl", (): void => {
  it("addresses the search route", (): void => {
    expect(billSearchRequestUrl("broadband")).toBe("/api/bills/search?q=broadband");
  });

  it("round-trips a query carrying the characters that would otherwise truncate it", (): void => {
    // An unencoded `&` ends the param and an unencoded `#` ends the URL, so both are the difference between searching
    // for this phrase and searching for its first two words.
    const query: string = "clean air & water #2";

    expect(parseQueryParam(paramsOf(billSearchRequestUrl(query)).get(BILL_API_PARAMS.query))).toBe(query);
  });

  it("round-trips a query the parser will cap, so the truncation is the parser's decision and not the URL's", (): void => {
    const query: string = "a".repeat(MAX_QUERY_LENGTH + 50);

    expect(parseQueryParam(paramsOf(billSearchRequestUrl(query)).get(BILL_API_PARAMS.query))).toHaveLength(
      MAX_QUERY_LENGTH,
    );
  });

  it("survives a blank query rather than producing a malformed URL", (): void => {
    // The directory doesn't search on an empty box, but the hook's guard is the only thing stopping it — so the route
    // stays well-defined if that ever changes. @see the search handler, which treats a blank query as matching all.
    expect(parseQueryParam(paramsOf(billSearchRequestUrl("")).get(BILL_API_PARAMS.query))).toBe("");
  });
});
