/**
 * Covers the two rules an error report has to keep: it never carries the Congress.gov key, and it names a page rather
 * than a query.
 *
 * The cases below are not hypothetical. Every URL here is one this app itself produces — `buildCongressUrl` really does
 * append `api_key=`, and every directory really does write its filters into the address bar — which is exactly why the
 * redaction matters. `error.test.tsx` already pins the DOM half of the same promise, with the same fake key; this file
 * pins the half that leaves the process.
 */
import { describe, expect, it } from "vitest";

import { REDACTED, redactEvent, redactSecrets, redactUrl } from "@/lib/observability/redact";

/** Stands in for a real Congress.gov key, in the same spelling `error.test.tsx` uses. */
const KEY: string = "SUPER-SECRET-KEY";

describe("redactUrl", (): void => {
  it("leaves a plain page URL alone", (): void => {
    expect(redactUrl("https://civic-ledger.example/committees")).toBe("https://civic-ledger.example/committees");
  });

  it("drops what a reader searched for", (): void => {
    expect(redactUrl("https://civic-ledger.example/bills?q=broadband")).toBe("https://civic-ledger.example/bills");
  });

  it("drops which party and state a reader narrowed the roster to", (): void => {
    expect(redactUrl("https://civic-ledger.example/members?party=republican&state=Ohio&sort=state")).toBe(
      "https://civic-ledger.example/members",
    );
  });

  it("drops the skip link's fragment, with or without a query string beside it", (): void => {
    expect(redactUrl("https://civic-ledger.example/members#main-content")).toBe("https://civic-ledger.example/members");
    expect(redactUrl("https://civic-ledger.example/members?q=ohio#main-content")).toBe(
      "https://civic-ledger.example/members",
    );
  });

  it("keeps the path segments that identify a record, since those are the page", (): void => {
    expect(redactUrl("https://civic-ledger.example/bills/119/hr/284")).toBe(
      "https://civic-ledger.example/bills/119/hr/284",
    );
  });

  it("takes the API key off an outbound Congress.gov URL, since the key lives past the `?`", (): void => {
    expect(redactUrl(`https://api.congress.gov/v3/bill/119/hr/284?format=json&api_key=${KEY}`)).toBe(
      "https://api.congress.gov/v3/bill/119/hr/284",
    );
  });

  it("returns something usable for input that is not a URL at all, rather than throwing inside the SDK", (): void => {
    expect(redactUrl("")).toBe("");
    expect(redactUrl("not a url?q=secret")).toBe("not a url");
  });
});

describe("redactSecrets", (): void => {
  it("replaces the key but keeps the sentence around it readable", (): void => {
    // The shape a `fetch` rejection actually takes. Cutting at the first `?` would save the key and lose the message.
    expect(redactSecrets(`Request failed: https://api.congress.gov/v3/bill/119?api_key=${KEY}`, [KEY])).toBe(
      `Request failed: https://api.congress.gov/v3/bill/119?api_key=${REDACTED}`,
    );
  });

  it("catches the key by pattern even when the literal value was never configured here", (): void => {
    // The browser bundle passes no secrets at all, so the pattern pass is the only one running there.
    expect(redactSecrets("GET /v3/bill?api_key=abc123&format=json")).toBe(
      `GET /v3/bill?api_key=${REDACTED}&format=json`,
    );
  });

  it("catches the bare value with no parameter name in front of it", (): void => {
    // This is the case a pattern cannot reach: a captured local, or a key interpolated into a hand-written message.
    expect(redactSecrets(`Using key ${KEY} for this request`, [KEY])).toBe(`Using key ${REDACTED} for this request`);
  });

  it("catches every occurrence, not only the first", (): void => {
    expect(redactSecrets(`api_key=${KEY} then again api_key=${KEY}`, [KEY])).toBe(
      `api_key=${REDACTED} then again api_key=${REDACTED}`,
    );
  });

  it("stops at the parameter boundary rather than eating the rest of the URL", (): void => {
    expect(redactSecrets("https://api.congress.gov/v3/bill?api_key=abc&format=json")).toBe(
      `https://api.congress.gov/v3/bill?api_key=${REDACTED}&format=json`,
    );
  });

  it("ignores an empty or whitespace-only secret instead of redacting the whole string", (): void => {
    // `getCongressApiKey()` returns undefined when no key is configured, and the server config passes "" in its place.
    // Splitting on an empty string would otherwise put a marker between every character.
    expect(redactSecrets("a normal message", ["", "   "])).toBe("a normal message");
  });

  it("leaves a string with nothing sensitive in it exactly as it was", (): void => {
    expect(redactSecrets("Congress.gov returned an unrecognized payload shape", [KEY])).toBe(
      "Congress.gov returned an unrecognized payload shape",
    );
  });
});

describe("redactEvent", (): void => {
  it("cuts the query off the reader's own URL on a captured request", (): void => {
    const event = { request: { url: "https://civic-ledger.example/members?party=republican&state=Ohio" } };

    expect(redactEvent(event)).toEqual({ request: { url: "https://civic-ledger.example/members" } });
  });

  it("drops the dedicated query-string and cookie fields outright", (): void => {
    const event = {
      request: { url: "https://civic-ledger.example/bills", query_string: "q=broadband", cookies: { session: "abc" } },
    };

    expect(redactEvent(event)).toEqual({ request: { url: "https://civic-ledger.example/bills" } });
  });

  it("cuts the outbound Congress.gov URL a fetch breadcrumb carries", (): void => {
    // The single most likely way the key would have reached Sentry: every upstream read makes one of these.
    const breadcrumb = {
      category: "fetch",
      data: { method: "GET", url: `https://api.congress.gov/v3/bill/119?format=json&api_key=${KEY}`, status_code: 500 },
    };

    expect(redactEvent(breadcrumb, [KEY])).toEqual({
      category: "fetch",
      data: { method: "GET", url: "https://api.congress.gov/v3/bill/119", status_code: 500 },
    });
  });

  it("scrubs the key out of an exception message, where cutting at the `?` would destroy the message", (): void => {
    const event = {
      exception: {
        values: [{ type: "Error", value: `Request failed: https://api.congress.gov/v3/bill?api_key=${KEY}` }],
      },
    };

    expect(redactEvent(event, [KEY])).toEqual({
      exception: {
        values: [{ type: "Error", value: `Request failed: https://api.congress.gov/v3/bill?api_key=${REDACTED}` }],
      },
    });
  });

  it("reaches the OpenTelemetry span attributes Sentry's tracing emits", (): void => {
    // Named differently from the fields above, contributed by a different layer, and just as capable of carrying a key.
    const event = {
      contexts: {
        trace: { data: { "http.url": `https://api.congress.gov/v3/member?api_key=${KEY}`, "http.method": "GET" } },
      },
    };

    expect(redactEvent(event, [KEY])).toEqual({
      contexts: { trace: { data: { "http.url": "https://api.congress.gov/v3/member", "http.method": "GET" } } },
    });
  });

  it("catches a bare key sitting anywhere in the payload, under any field name", (): void => {
    // The whole reason the walk is a walk: nobody has to have predicted this field for it to be covered.
    expect(redactEvent({ extra: { somethingNobodyPlannedFor: `token ${KEY}` } }, [KEY])).toEqual({
      extra: { somethingNobodyPlannedFor: `token ${REDACTED}` },
    });
  });

  it("walks into arrays as well as objects", (): void => {
    const event = { breadcrumbs: [{ data: { url: "https://civic-ledger.example/bills?q=water" } }] };

    expect(redactEvent(event)).toEqual({
      breadcrumbs: [{ data: { url: "https://civic-ledger.example/bills" } }],
    });
  });

  it("leaves non-string values alone, so numbers and flags survive the pass", (): void => {
    const event = { level: "error", timestamp: 1_700_000_000, contexts: { trace: { sampled: true, op: null } } };

    expect(redactEvent(event)).toEqual(event);
  });

  it("never mutates the payload it was handed", (): void => {
    // The SDK may hold this object for other handlers; redaction returns a copy rather than editing theirs.
    const event = { request: { url: "https://civic-ledger.example/bills?q=broadband" } };
    redactEvent(event);

    expect(event.request.url).toBe("https://civic-ledger.example/bills?q=broadband");
  });

  it("terminates on a cycle instead of recurring forever", (): void => {
    const event: Record<string, unknown> = { request: { url: "https://civic-ledger.example/bills" } };
    event.self = event;

    // Dropped rather than followed: an un-walked branch is an un-redacted one, so the safe answer is to omit it.
    expect(redactEvent(event)).toEqual({ request: { url: "https://civic-ledger.example/bills" }, self: undefined });
  });

  it("stops descending past the depth cap rather than walking an arbitrarily deep payload", (): void => {
    // 14 levels, past the cap of 12. Built rather than written out so the shape stays legible.
    let deep: Record<string, unknown> = { url: `https://api.congress.gov/v3?api_key=${KEY}` };
    for (let i = 0; i < 14; i += 1) deep = { nested: deep };

    const redacted = JSON.stringify(redactEvent(deep, [KEY]));

    expect(redacted).not.toContain(KEY);
  });
});
