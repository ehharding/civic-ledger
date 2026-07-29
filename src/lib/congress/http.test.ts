/**
 * Covers http.ts's boundary rules — the ones the module's own documentation makes security claims about.
 *
 * Two of those claims are load-bearing and were previously asserted nowhere:
 *
 * 1. A route-derived value can never reach Congress.gov malformed. `normalizeBillRouteParams` and
 *    `normalizeBioguideId` validate *shape* rather than escaping, so a bad segment is rejected outright instead of
 *    being sanitized and sent anyway. The traversal and smuggling cases below are the specific failures that rule
 *    exists to prevent.
 * 2. The server-only key is always the last word in an outbound URL — a caller cannot displace it by passing its own
 *    `api_key` param, however that param got into their hands.
 *
 * The rest covers what "configured" means for the key, since an empty-string key and an absent one have to behave
 * identically for the preview path to work.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  BILL_LIST_CACHE_TAG,
  BILL_PATH_TYPES,
  billCacheTags,
  buildCongressUrl,
  CONGRESS_API_BASE,
  getCongressApiKey,
  MEMBER_LIST_CACHE_TAG,
  memberCacheTags,
  normalizeBillRouteParams,
  normalizeBioguideId,
} from "@/lib/congress/http";

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

describe("cache tags", (): void => {
  it("scopes a bill's tags under the shared bill-list tag, so one bill or all of them can be revalidated", (): void => {
    const tags: string[] = billCacheTags({ congress: "119", type: "hr", number: "284" });

    expect(tags).toContain(BILL_LIST_CACHE_TAG);
    expect(tags).toContain("bill-119-hr-284");
  });

  it("scopes a member's tags under the shared member-list tag", (): void => {
    const tags: string[] = memberCacheTags("L000174");

    expect(tags).toContain(MEMBER_LIST_CACHE_TAG);
    expect(tags).toContain("member-L000174");
  });
});
