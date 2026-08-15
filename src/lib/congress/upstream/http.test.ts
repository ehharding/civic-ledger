/**
 * Covers http.ts's boundary rules — the ones the module's own documentation makes security claims about.
 *
 * Two of those claims are load-bearing, and neither is observable from any other test in the suite:
 *
 * 1. A route-derived value can never reach Congress.gov malformed. `normalizeBillRouteParams` and `normalizeBioguideId`
 *    validate *shape* rather than escaping, so a bad segment is rejected outright instead of being sanitized and sent
 *    anyway. The traversal and smuggling cases below are the specific failures that rule exists to prevent.
 * 2. The server-only key is always the last word in an outbound URL — a caller cannot displace it by passing its own
 *    `api_key` param, however that param got into their hands.
 *
 * The rest covers what "configured" means for the key, since an empty-string key and an absent one have to behave
 * identically for the preview path to work.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  BILL_LIST_CACHE_TAG,
  BILL_PATH_TYPES,
  billCacheTags,
  buildCongressUrl,
  COMMITTEE_LIST_CACHE_TAG,
  CONGRESS_API_BASE,
  type CongressRequestResult,
  committeeCacheTags,
  fetchCongressGov,
  getCongressApiKey,
  MEMBER_LIST_CACHE_TAG,
  memberCacheTags,
  normalizeBillRouteParams,
  normalizeBioguideId,
  normalizeCommitteeChamberSegment,
  normalizeSystemCode,
  REQUEST_TIMEOUT_MS,
  requestCongressJson,
} from "@/lib/congress/upstream/http";

/**
 * Segments that must never survive a guard, each standing for a different way a URL can be subverted: climbing out of
 * the endpoint's path, appending a query the caller never intended, starting a whole new URL, or smuggling a separator
 * through an encoding the guard might not have normalized.
 */
const HOSTILE_SEGMENTS: readonly string[] = [
  "..",
  "../",
  "../../member",
  "..%2f..%2fmember",
  "284?format=xml",
  "284&api_key=stolen",
  "284#fragment",
  "284/summaries",
  "https://evil.example/284",
  "//evil.example",
  "%2e%2e%2f",
  "2 84",
  "",
  "   ",
];

const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

afterEach((): void => {
  if (originalApiKey === undefined) delete process.env.CONGRESS_API_KEY;
  else process.env.CONGRESS_API_KEY = originalApiKey;
});

describe("normalizeBillRouteParams", (): void => {
  it("accepts a well-formed route and lower-cases the type segment", (): void => {
    expect(normalizeBillRouteParams({ congress: "119", type: "HR", number: "284" })).toEqual({
      congress: "119",
      type: "hr",
      number: "284",
    });
  });

  it("trims incidental whitespace rather than rejecting the route over it", (): void => {
    expect(normalizeBillRouteParams({ congress: " 119 ", type: " hr ", number: " 284 " })).toEqual({
      congress: "119",
      type: "hr",
      number: "284",
    });
  });

  it("accepts every bill and resolution type Congress.gov's bill endpoint serves", (): void => {
    for (const type of BILL_PATH_TYPES) {
      expect(normalizeBillRouteParams({ congress: "119", type, number: "1" })).not.toBeNull();
    }
  });

  it("rejects a type that isn't one of the eight, so one endpoint can't be aimed at another", (): void => {
    expect(normalizeBillRouteParams({ congress: "119", type: "member", number: "284" })).toBeNull();
    expect(normalizeBillRouteParams({ congress: "119", type: "amendment", number: "284" })).toBeNull();
  });

  it("rejects a congress segment that isn't one to three digits", (): void => {
    expect(normalizeBillRouteParams({ congress: "1190", type: "hr", number: "284" })).toBeNull();
    expect(normalizeBillRouteParams({ congress: "-5", type: "hr", number: "284" })).toBeNull();
    expect(normalizeBillRouteParams({ congress: "11.9", type: "hr", number: "284" })).toBeNull();
    expect(normalizeBillRouteParams({ congress: "one-nineteen", type: "hr", number: "284" })).toBeNull();
  });

  it("rejects a bill number longer than six digits or carrying anything but digits", (): void => {
    expect(normalizeBillRouteParams({ congress: "119", type: "hr", number: "1234567" })).toBeNull();
    expect(normalizeBillRouteParams({ congress: "119", type: "hr", number: "284a" })).toBeNull();
  });

  it("rejects every hostile segment outright rather than escaping it and sending it anyway", (): void => {
    for (const hostile of HOSTILE_SEGMENTS) {
      expect(normalizeBillRouteParams({ congress: hostile, type: "hr", number: "284" })).toBeNull();
      expect(normalizeBillRouteParams({ congress: "119", type: hostile, number: "284" })).toBeNull();
      expect(normalizeBillRouteParams({ congress: "119", type: "hr", number: hostile })).toBeNull();
    }
  });
});

describe("normalizeBioguideId", (): void => {
  it("accepts a real Bioguide ID and upper-cases it, so one person has one URL", (): void => {
    expect(normalizeBioguideId("l000174")).toBe("L000174");
    expect(normalizeBioguideId(" L000174 ")).toBe("L000174");
  });

  it("rejects the preview fixtures' deliberately invalid IDs, so a placeholder is never requested upstream", (): void => {
    expect(normalizeBioguideId("PREVIEW-1")).toBeNull();
    expect(normalizeBioguideId("PREVIEW-7")).toBeNull();
  });

  it("rejects anything that isn't one letter followed by six digits", (): void => {
    expect(normalizeBioguideId("L00017")).toBeNull();
    expect(normalizeBioguideId("L0001744")).toBeNull();
    expect(normalizeBioguideId("LL00174")).toBeNull();
    expect(normalizeBioguideId("1000174")).toBeNull();
  });

  it("rejects every hostile segment", (): void => {
    for (const hostile of HOSTILE_SEGMENTS) {
      expect(normalizeBioguideId(hostile)).toBeNull();
    }
  });
});

describe("normalizeSystemCode", (): void => {
  it("accepts a real system code and lower-cases it, so one committee has one URL", (): void => {
    expect(normalizeSystemCode("HSAG00")).toBe("hsag00");
    expect(normalizeSystemCode(" hsag14 ")).toBe("hsag14");
  });

  it("rejects the preview fixtures' deliberately invalid codes, so a placeholder is never requested upstream", (): void => {
    expect(normalizeSystemCode("preview-01")).toBeNull();
    expect(normalizeSystemCode("preview-01a")).toBeNull();
  });

  it("rejects anything that isn't letters followed by two digits", (): void => {
    expect(normalizeSystemCode("hsag0")).toBeNull();
    expect(normalizeSystemCode("hsag000")).toBeNull();
    expect(normalizeSystemCode("00hsag")).toBeNull();
    expect(normalizeSystemCode("hs ag00")).toBeNull();
  });

  it("rejects every hostile segment", (): void => {
    for (const hostile of HOSTILE_SEGMENTS) {
      expect(normalizeSystemCode(hostile)).toBeNull();
    }
  });
});

describe("normalizeCommitteeChamberSegment", (): void => {
  /*
   * The committee endpoint takes its chamber in the path, which makes this the same class of guard as the two above —
   * and it is narrowed against the app's own closed union, so no separate list of accepted spellings can drift out of
   * step with the model.
   */
  it("accepts each chamber the endpoint takes, in any case", (): void => {
    expect(normalizeCommitteeChamberSegment("house")).toBe("house");
    expect(normalizeCommitteeChamberSegment("SENATE")).toBe("senate");
    expect(normalizeCommitteeChamberSegment(" joint ")).toBe("joint");
  });

  it("rejects a chamber the endpoint has no path for", (): void => {
    expect(normalizeCommitteeChamberSegment("assembly")).toBeNull();
    expect(normalizeCommitteeChamberSegment("House of Representatives")).toBeNull();
    expect(normalizeCommitteeChamberSegment("")).toBeNull();
  });

  it("rejects every hostile segment", (): void => {
    for (const hostile of HOSTILE_SEGMENTS) {
      expect(normalizeCommitteeChamberSegment(hostile)).toBeNull();
    }
  });
});

describe("committeeCacheTags", (): void => {
  /* The list tag is shared so the whole family can be revalidated at once; the per-committee tag scopes one record. */
  it("tags a committee with both the shared list tag and its own", (): void => {
    expect(committeeCacheTags("hsag00")).toEqual([COMMITTEE_LIST_CACHE_TAG, "committee-hsag00"]);
  });

  it("does not collide with the member family's tags", (): void => {
    expect(COMMITTEE_LIST_CACHE_TAG).not.toBe(MEMBER_LIST_CACHE_TAG);
  });
});

describe("buildCongressUrl", (): void => {
  it("targets the v3 base and always requests JSON explicitly", (): void => {
    const url: URL = buildCongressUrl("/bill/119/hr/284", "test-key");

    expect(url.origin + url.pathname).toBe(`${CONGRESS_API_BASE}/bill/119/hr/284`);
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("api_key")).toBe("test-key");
  });

  it("applies endpoint params alongside the standard ones", (): void => {
    const url: URL = buildCongressUrl("/bill/119", "test-key", { limit: "250", offset: "12" });

    expect(url.searchParams.get("limit")).toBe("250");
    expect(url.searchParams.get("offset")).toBe("12");
    expect(url.searchParams.get("format")).toBe("json");
  });

  it("gives the real key the last word, so a caller-supplied api_key param cannot displace it", (): void => {
    const url: URL = buildCongressUrl("/bill/119", "real-key", { api_key: "attacker-key" });

    expect(url.searchParams.get("api_key")).toBe("real-key");
    expect(url.searchParams.getAll("api_key")).toEqual(["real-key"]);
    expect(url.toString()).not.toContain("attacker-key");
  });

  it("percent-encodes param values rather than letting them alter the query's structure", (): void => {
    const url: URL = buildCongressUrl("/bill/119", "test-key", { q: "broadband&api_key=stolen" });

    expect(url.searchParams.get("q")).toBe("broadband&api_key=stolen");
    expect(url.searchParams.get("api_key")).toBe("test-key");
  });
});

describe("getCongressApiKey", (): void => {
  it("reports no key when the variable is unset", (): void => {
    delete process.env.CONGRESS_API_KEY;

    expect(getCongressApiKey()).toBeUndefined();
  });

  it("treats an empty or whitespace-only key as absent, so a half-copied .env takes the preview path", (): void => {
    process.env.CONGRESS_API_KEY = "";
    expect(getCongressApiKey()).toBeUndefined();

    process.env.CONGRESS_API_KEY = "   ";
    expect(getCongressApiKey()).toBeUndefined();
  });

  it("trims a configured key, so a stray newline from a copy-paste doesn't reach the query string", (): void => {
    process.env.CONGRESS_API_KEY = "  test-key\n";

    expect(getCongressApiKey()).toBe("test-key");
  });
});

describe("request timeout", (): void => {
  /*
   * The point of the timeout is not that a slow request is canceled — it is that a stalled one still resolves into the
   * adapter's ordinary "failed" outcome instead of never resolving at all. A request that never settles never reaches
   * the catch that would have produced the fallback, which is the one upstream failure mode the rest of this module's
   * "nothing throws" design does not cover on its own.
   */
  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it("bounds every request with an abort signal, alongside the shared cache window", (): void => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    void fetchCongressGov(buildCongressUrl("/bill/119", "test-key"), [BILL_LIST_CACHE_TAG]);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & { next?: { tags?: string[] } };

    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.next?.tags).toEqual([BILL_LIST_CACHE_TAG]);
  });

  it("allows a request long enough to be a real answer rather than a slow one", (): void => {
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    expect(REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });

  it("reports a payload whose shape doesn't match as failed rather than handing it on", async (): Promise<void> => {
    // The untrusted-input boundary: a 200 is not the same as a usable response. Validating here rather than at each
    // call site is what lets every caller assume the payload it receives is the shape it asked for.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ bills: "not an array" }))));
    const consoleError = vi.spyOn(console, "error").mockImplementation((): void => undefined);

    const result: CongressRequestResult<{ bills: unknown[] }> = await requestCongressJson(
      buildCongressUrl("/bill/119", "test-key"),
      [BILL_LIST_CACHE_TAG],
      z.object({ bills: z.array(z.unknown()) }),
      "bill list",
    );

    expect(result).toEqual({ outcome: "failed" });
    // Logged, never rendered — the caller decides what a person sees, and it is never an upstream error message.
    // At `error` rather than `warn`, and that distinction is the point: a 503 is weather, but a 200 whose body no
    // longer matches the schema means Congress.gov changed its contract or this app reads it wrongly, and nothing
    // retries its way out of either. Without a report the symptom is a page section that is permanently, silently
    // empty. @see src/lib/observability/log.ts.
    expect(consoleError).toHaveBeenCalledWith(
      "[civic-ledger] Congress.gov returned an unrecognized payload shape",
      // The failing field path, not the payload: enough to find the drift, without forwarding a response body to a
      // third party to get it.
      expect.objectContaining({ reason: "schema-mismatch", context: "bill list", paths: "bills" }),
    );
    consoleError.mockRestore();
  });

  it("names the root when the whole payload is the wrong shape, rather than logging an empty path", async (): Promise<void> => {
    // An empty Zod path is what a wholly wrong top-level value produces, and it would otherwise render as an empty
    // string — which reads as a missing field rather than as the finding it is.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(["not", "an", "object"]))));
    const consoleError = vi.spyOn(console, "error").mockImplementation((): void => undefined);

    const result: CongressRequestResult<{ bills: unknown[] }> = await requestCongressJson(
      buildCongressUrl("/bill/119", "test-key"),
      [BILL_LIST_CACHE_TAG],
      z.object({ bills: z.array(z.unknown()) }),
      "bill list",
    );

    expect(result).toEqual({ outcome: "failed" });
    expect(consoleError).toHaveBeenCalledWith(
      "[civic-ledger] Congress.gov returned an unrecognized payload shape",
      expect.objectContaining({ paths: "(root)" }),
    );
    consoleError.mockRestore();
  });

  it("logs a non-404 status as weather, with the code, rather than as a defect", async (): Promise<void> => {
    // The commonest real failure — Congress.gov rate-limiting or briefly down. It is counted, not filed as an issue: a
    // search sweep fans out one request per Congress, so an outage produces these by the hundred.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation((): void => undefined);

    const result: CongressRequestResult<unknown> = await requestCongressJson(
      buildCongressUrl("/bill/119", "test-key"),
      [BILL_LIST_CACHE_TAG],
      z.unknown(),
      "bill list",
    );

    expect(result).toEqual({ outcome: "failed" });
    expect(consoleWarn).toHaveBeenCalledWith(
      "[civic-ledger] Congress.gov request failed",
      expect.objectContaining({ reason: "http-status", status: 503, context: "bill list" }),
    );
    consoleWarn.mockRestore();
  });

  it("never lets the API key reach the log line, on the one path that carries a URL holding it", async (): Promise<void> => {
    // The reason `requestCongressJson` passes `secrets` at all. Before `log.ts` this line was a bare `console.error`
    // with the caught error interpolated into it, and a function log on a managed host is a third-party sink like any
    // other — so `docs/data-policy.md`'s rule applied to it and nothing enforced it.
    vi.stubEnv("CONGRESS_API_KEY", "SUPER-SECRET-KEY");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED https://api.congress.gov/v3?api_key=SUPER-SECRET-KEY")),
    );
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation((): void => undefined);

    await requestCongressJson(
      buildCongressUrl("/bill/119", "test-key"),
      [BILL_LIST_CACHE_TAG],
      z.unknown(),
      "bill list",
    );

    const [, attributes] = consoleWarn.mock.calls[0] as [string, { cause?: string }];

    expect(attributes.cause).toContain("api_key=[redacted]");
    expect(attributes.cause).not.toContain("SUPER-SECRET-KEY");

    consoleWarn.mockRestore();
    vi.unstubAllEnvs();
  });

  it("reports a timed-out request as failed, not as not-found, so the caller falls back rather than 404s", async (): Promise<void> => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    );
    // `warn`, like every other transport failure: a stalled socket is weather. @see src/lib/observability/log.ts.
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation((): void => undefined);

    const result: CongressRequestResult<unknown> = await requestCongressJson(
      buildCongressUrl("/bill/119", "test-key"),
      [BILL_LIST_CACHE_TAG],
      z.unknown(),
      "bill list",
    );

    expect(result).toEqual({ outcome: "failed" });
    consoleWarn.mockRestore();
  });
});

describe("cache tags", (): void => {
  it("scopes a bill's tags under the shared bill-list tag, so one bill or all of them can be revalidated", (): void => {
    const tags: string[] = billCacheTags({ congress: "119", type: "hr", number: "284" });

    expect(tags).toContain(BILL_LIST_CACHE_TAG);
    expect(tags).toContain("bill-119-hr-284");
  });

  it("spells one bill's tag one way, whichever casing the caller happens to hold", (): void => {
    // A route param arrives lower-cased and a parsed search citation arrives upper-cased, and both reach this for the
    // same bill. Left alone they produce two tags, and a revalidation of one would reach only half that bill's records.
    expect(billCacheTags({ congress: "119", type: "HR", number: "284" })).toEqual(
      billCacheTags({ congress: "119", type: "hr", number: "284" }),
    );
    expect(billCacheTags({ congress: " 119 ", type: " Hr ", number: " 284 " })).toContain("bill-119-hr-284");
  });

  it("scopes a member's tags under the shared member-list tag", (): void => {
    const tags: string[] = memberCacheTags("L000174");

    expect(tags).toContain(MEMBER_LIST_CACHE_TAG);
    expect(tags).toContain("member-L000174");
  });
});
