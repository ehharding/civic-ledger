/**
 * Covers the request half of the API contract as round trips: each URL the browser builds is parsed exactly as the
 * route handler does and fed to the same `api-query.ts` parser, so a change to either side that breaks the other fails.
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
    // stays well-defined if that ever changes. See the search handler, which treats a blank query as matching all.
    expect(parseQueryParam(paramsOf(billSearchRequestUrl("")).get(BILL_API_PARAMS.query))).toBe("");
  });
});
