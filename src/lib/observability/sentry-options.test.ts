/**
 * Covers the configuration Sentry is initialized with, in all three runtimes.
 *
 * The assertions worth having here are the negative ones. Sentry's documented default is to send the full query string
 * of every incoming and outgoing request, which in this app means both the reader's search terms and the Congress.gov
 * key — so "`urlQueryParams` is `false`" is a security and privacy property, not a preference, and it is pinned as one.
 * @see redact.test.ts for the backstop that still holds if a future SDK version adds a field this block does not name.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { REDACTED } from "@/lib/observability/redact";
import {
  getSentryDsn,
  getSentryEnvironment,
  getTracesSampleRate,
  sentryInitOptions,
} from "@/lib/observability/sentry-options";

/** Stands in for a real Congress.gov key, in the same spelling `error.test.tsx` and `redact.test.ts` use. */
const KEY: string = "SUPER-SECRET-KEY";

/** A plausible DSN. Never a real one — a DSN is a write credential for a Sentry project. */
const DSN: string = "https://examplePublicKey@o0.ingest.sentry.io/0";

afterEach((): void => {
  vi.unstubAllEnvs();
});

describe("getSentryDsn", (): void => {
  it("reads the configured DSN", (): void => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);

    expect(getSentryDsn()).toBe(DSN);
  });

  it("treats an unset, empty, or whitespace-only value as no DSN at all", (): void => {
    // The same rule `getCongressApiKey` follows, for the same reason: a value left blank after copying `.env.example`
    // should take the quiet path rather than initializing the SDK against a DSN it cannot use.
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", undefined);
    expect(getSentryDsn()).toBeUndefined();

    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "   ");
    expect(getSentryDsn()).toBeUndefined();
  });

  it("trims a value that picked up whitespace on its way into the environment", (): void => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", `  ${DSN}  `);

    expect(getSentryDsn()).toBe(DSN);
  });
});

describe("getSentryEnvironment", (): void => {
  it("prefers an explicitly configured environment", (): void => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "staging");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");

    expect(getSentryEnvironment()).toBe("staging");
  });

  it("falls back to Vercel's own environment name", (): void => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", undefined);
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");

    expect(getSentryEnvironment()).toBe("preview");
  });

  it("labels an unconfigured build as development rather than leaving it unlabeled", (): void => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", undefined);
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", undefined);

    expect(getSentryEnvironment()).toBe("development");
  });

  it("ignores a whitespace-only value", (): void => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "  ");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", undefined);

    expect(getSentryEnvironment()).toBe("development");
  });
});

describe("getTracesSampleRate", (): void => {
  it("uses the configured rate", (): void => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", "0.5");

    expect(getTracesSampleRate()).toBe(0.5);
  });

  it("accepts both ends of the range", (): void => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", "0");
    expect(getTracesSampleRate()).toBe(0);

    vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", "1");
    expect(getTracesSampleRate()).toBe(1);
  });

  it("falls back to the default when nothing is configured", (): void => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", undefined);

    expect(getTracesSampleRate()).toBe(0.1);
  });

  it("falls back rather than handing the SDK a value it cannot sample with", (): void => {
    // A typo in a deployment variable should cost the intended rate, not tracing itself — an `NaN` reaching the SDK
    // disables sampling in a way whose only symptom is an empty performance tab noticed weeks later.
    for (const bad of ["10%", "abc", "-1", "2", ""]) {
      vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", bad);
      expect(getTracesSampleRate()).toBe(0.1);
    }
  });
});

describe("sentryInitOptions", (): void => {
  it("refuses the query string of every request, which is the line the integration turns on", (): void => {
    // Sentry's documented default is to send it. In this app that string is both the reader's search terms and the
    // Congress.gov key, so this single `false` is doing most of the work in this file.
    expect(sentryInitOptions().dataCollection?.urlQueryParams).toBe(false);
  });

  it("refuses headers, cookies, request bodies, user info, and captured locals", (): void => {
    const { dataCollection } = sentryInitOptions();

    // `Referer` is a full URL with the previous page's query string on it; a captured local is how the API key reaches
    // an event with no `api_key=` prefix for a pattern to find.
    expect(dataCollection?.httpHeaders).toEqual({ request: false, response: false });
    expect(dataCollection?.cookies).toBe(false);
    expect(dataCollection?.httpBodies).toEqual([]);
    expect(dataCollection?.userInfo).toBe(false);
    expect(dataCollection?.stackFrameVariables).toBe(false);
  });

  it("stays switched off entirely when no DSN is configured", (): void => {
    // A supported state, not a misconfiguration: it is how the static demo ships and how a local checkout stays out of
    // the project's issue stream.
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", undefined);
    const options = sentryInitOptions();

    expect(options.enabled).toBe(false);
    expect(options.dsn).toBeUndefined();
  });

  it("switches on once a DSN is configured", (): void => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
    const options = sentryInitOptions();

    expect(options.enabled).toBe(true);
    expect(options.dsn).toBe(DSN);
  });

  it("redacts an error event before it is sent", (): void => {
    const event = {
      request: { url: "https://civic-ledger.example/members?party=republican&state=Ohio" },
      exception: { values: [{ value: `Request failed: https://api.congress.gov/v3/bill?api_key=${KEY}` }] },
    };

    // biome-ignore lint/suspicious/noExplicitAny: the SDK's event types are far wider than this fixture needs to be.
    const sent = sentryInitOptions([KEY]).beforeSend?.(event as any, {} as any);

    expect(JSON.stringify(sent)).not.toContain(KEY);
    expect(JSON.stringify(sent)).toContain(REDACTED);
    expect(JSON.stringify(sent)).not.toContain("party=republican");
  });

  it("redacts a transaction before it is sent, not only an error", (): void => {
    // Tracing is the path that carries outbound Congress.gov URLs most often, so leaving it out would have left the
    // likeliest leak uncovered.
    const transaction = {
      transaction: "GET /bills",
      contexts: { trace: { data: { "http.url": `https://api.congress.gov/v3/bill?api_key=${KEY}` } } },
    };

    // biome-ignore lint/suspicious/noExplicitAny: as above.
    const sent = sentryInitOptions([KEY]).beforeSendTransaction?.(transaction as any, {} as any);

    expect(JSON.stringify(sent)).not.toContain(KEY);
  });

  it("redacts a breadcrumb before it is recorded", (): void => {
    const breadcrumb = { category: "fetch", data: { url: `https://api.congress.gov/v3/bill/119?api_key=${KEY}` } };

    // biome-ignore lint/suspicious/noExplicitAny: as above.
    const sent = sentryInitOptions([KEY]).beforeBreadcrumb?.(breadcrumb as any, {} as any);

    expect(JSON.stringify(sent)).not.toContain(KEY);
  });

  it("still strips a key by pattern when no literal secret was passed, as in the browser", (): void => {
    // The client bundle has never held the key and passes no secrets; the pattern pass is all it has, and it is enough
    // for anything shaped like a Congress.gov URL.
    const event = { exception: { values: [{ value: "Failed: https://api.congress.gov/v3/bill?api_key=leaked" }] } };

    // biome-ignore lint/suspicious/noExplicitAny: as above.
    const sent = sentryInitOptions().beforeSend?.(event as any, {} as any);

    expect(JSON.stringify(sent)).not.toContain("leaked");
  });
});
