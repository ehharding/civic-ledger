import type * as Sentry from "@sentry/nextjs";

import { redactEvent } from "@/lib/observability/redact";

/**
 * The single `Sentry.init` configuration, shared by all three runtimes so every rule about what leaves the process
 * holds everywhere. The three Next.js entry points only call `Sentry.init(sentryInitOptions(…))`.
 *
 * Defaults are overridden because this app's URLs carry credentials and searches.
 *
 * @see redact.ts
 */

/**
 * The option bag `Sentry.init` accepts, derived from the function because `@sentry/nextjs` doesn't export the type (and
 * `@sentry/core` is an undeclared transitive dependency).
 */
type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

// The four redaction callbacks, each recovered from the options bag for the same reason as `SentryInitOptions`.
/** Sentry's error-event hook. */
type BeforeSend = NonNullable<SentryInitOptions["beforeSend"]>;
/** Sentry's tracing-span hook. */
type BeforeSendSpan = NonNullable<SentryInitOptions["beforeSendSpan"]>;
/** Sentry's breadcrumb hook. */
type BeforeBreadcrumb = NonNullable<SentryInitOptions["beforeBreadcrumb"]>;
/** Sentry's structured-log hook. */
type BeforeSendLog = NonNullable<SentryInitOptions["beforeSendLog"]>;

/** The environment name reported with every event, when nothing more specific is configured. */
const FALLBACK_ENVIRONMENT: string = "development";

/**
 * The share of transactions sampled for tracing when nothing is configured.
 *
 * Low on purpose. Tracing's value here is the search sweep — `getSearchResults` fans out one request per Congress, so a
 * slow search is a question about which of ~27 parallel requests dragged — and that question is answered as well by one
 * request in ten as by all of them. It is also the sampling rate that keeps a civic side project inside a free quota,
 * which is the difference between an error tracker that stays on and one that gets switched off in a month.
 */
const DEFAULT_TRACES_SAMPLE_RATE: number = 0.1;

/**
 * Error messages from a visitor's environment, never this app, dropped before reaching the issue stream. Matched as
 * substrings, so keep each specific.
 *
 * - `Object Not Found Matching Id:` — Microsoft's link scanner (Outlook Safe Links / Bing preview) rejecting inside its
 *   own headless host.
 */
const IGNORED_ERRORS: readonly string[] = ["Object Not Found Matching Id:"];

/**
 * Reads the deployment's environment name. **Set `NEXT_PUBLIC_SENTRY_ENVIRONMENT` on the deployment**: without it,
 * production may be labeled "development". The `NEXT_PUBLIC_VERCEL_ENV` fallback isn't guaranteed by Vercel, and a bare
 * `VERCEL_ENV` isn't inlined into the browser bundle.
 *
 * @returns The configured environment, or {@link FALLBACK_ENVIRONMENT}.
 */
export function getSentryEnvironment(): string {
  const configured: string = (
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    process.env.NEXT_PUBLIC_VERCEL_ENV ??
    ""
  ).trim();

  return configured.length > 0 ? configured : FALLBACK_ENVIRONMENT;
}

/**
 * Reads the DSN that tells the SDK where to report. Blank counts as absent, which is a supported state: the Pages demo
 * and local checkouts don't report.
 *
 * @returns The trimmed DSN, or `undefined` when none is usably configured.
 */
export function getSentryDsn(): string | undefined {
  const dsn: string = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").trim();
  return dsn.length > 0 ? dsn : undefined;
}

/**
 * Reads the tracing sample rate.
 *
 * @returns The configured rate when it parses to a number within Sentry's accepted 0–1 range, and
 *   {@link DEFAULT_TRACES_SAMPLE_RATE} otherwise. A typo in a deployment variable should cost the intended sample rate,
 *   not tracing itself — `Number("10%")` is `NaN`, and an `NaN` rate reaching the SDK disables sampling in a way whose
 *   only symptom is an empty performance tab weeks later.
 */
export function getTracesSampleRate(): number {
  const raw: string = (process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "").trim();
  if (raw.length === 0) return DEFAULT_TRACES_SAMPLE_RATE;

  const parsed: number = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_TRACES_SAMPLE_RATE;
}

/**
 * Builds the `Sentry.init` options for whichever runtime is calling.
 *
 * @param secrets - Literal values that must never appear in an event. The server and edge configs pass the
 *   Congress.gov key; the browser passes nothing, because it has never held one and importing the server-only reader
 *   to prove it would drag the whole upstream adapter into the client bundle.
 * @returns Options suitable for `Sentry.init` in any of the three runtimes.
 */
export function sentryInitOptions(secrets: readonly string[] = []): SentryInitOptions {
  const dsn: string | undefined = getSentryDsn();

  return {
    dsn,

    // Explicit rather than relying on the SDK's own no-DSN no-op. Both do the same thing today; only this one says
    // that shipping without a DSN is a supported configuration rather than an oversight nobody has noticed yet.
    enabled: dsn !== undefined,

    environment: getSentryEnvironment(),
    tracesSampleRate: getTracesSampleRate(),

    // A copy because the SDK's option type wants a mutable array and the list above is a constant. See IGNORED_ERRORS.
    ignoreErrors: [...IGNORED_ERRORS],

    // Structured logs need no option: calling `Sentry.logger.*` (from `log.ts`) is the opt-in, which makes
    // `beforeSendLog` below the only filter between a log line and the network. Logs aren't sampled — a dropped error
    // log is a failure nobody can count.
    //
    // No `consoleLoggingIntegration`: it would forward every dependency's unredacted console output, duplicating what
    // `log.ts` already sends.

    /**
     * What the SDK is allowed to gather before any of this app's own code sees it.
     *
     * This block and the four callbacks below do overlapping work, deliberately. This one is the SDK's own switch,
     * which means it is honored by collection paths this app's callbacks may not be able to reach; the callbacks are
     * the backstop that still holds if a future version adds a field this block does not name. A leaked Congress.gov
     * key is not a defect worth being elegant about.
     */
    dataCollection: {
      // The line the whole integration turns on. Sentry's documented default is to send the full query string of every
      // incoming and outgoing request — which here means both `?q=broadband` (what a reader searched for) and
      // `?api_key=…` (the credential `docs/data-policy.md` says never reaches a browser).
      urlQueryParams: false,

      // Headers carry the same two problems by another route: `Referer` is a full URL with the previous page's query
      // string on it, and `Cookie` is a header. Nothing in this app's failure modes — upstream fetch failures and
      // render errors — is diagnosed from a request header, so there is nothing to trade away by refusing them.
      httpHeaders: { request: false, response: false },
      cookies: false,

      // A response body from Congress.gov is a public record and no secret, but a request body is not something a
      // read-only surface over public records should be shipping to a third party at all.
      httpBodies: [],

      // No reader of this site is identified, so there is no user to populate. Stated rather than left to the default
      // so that a future auth layer (see the Persistence Plan in docs/architecture.md) has to change this line on
      // purpose instead of inheriting a decision nobody made.
      userInfo: false,

      // The one that is easy to miss. `getCongressApiKey()` returns the key into a local, which every stack frame below
      // it can capture — with no `api_key=` prefix for a pattern to find. Sentry's own type notes that filtering these
      // by *name* is unreliable because minifiers rename locals, which is exactly why this is off outright and why
      // `redactSecrets` also scrubs the key's literal value.
      stackFrameVariables: false,

      // Off for categories this app does not produce today, because SDK v11 turned every one of them *on* by default.
      // Stating them is what makes that a decision rather than an inheritance: `databaseQueryData` in particular is
      // the one the deferred Postgres layer (see the Persistence Plan in docs/architecture.md) would start filling the
      // day it lands, and query text is exactly where a reader's search terms would end up.
      databaseQueryData: false,
      genAI: { inputs: false, outputs: false },
      queues: false,
      graphQL: { document: false, variables: false },
    },

    /**
     * The backstop, covering every exit: events, breadcrumbs, spans, and logs.
     *
     * All four are pure and never throw, since they run inside the SDK's dispatch. In SDK v11, `beforeSendSpan` is the
     * span hook (`beforeSendTransaction` still type-checks but is never called). `beforeSendLog` backs up the redaction
     * `log.ts` already does.
     *
     * @see redact.ts
     */
    // biome-ignore-start lint/nursery/useExplicitReturnType: each `satisfies` clause already types parameter and return
    // from the SDK's own hook type; spelling them out would stop tracking the SDK. See SentryInitOptions.
    beforeSend: ((event) => redactEvent(event, secrets)) satisfies BeforeSend,
    beforeSendSpan: ((span) => redactEvent(span, secrets)) satisfies BeforeSendSpan,
    beforeBreadcrumb: ((breadcrumb) => redactEvent(breadcrumb, secrets)) satisfies BeforeBreadcrumb,
    beforeSendLog: ((log) => redactEvent(log, secrets)) satisfies BeforeSendLog,
    // biome-ignore-end lint/nursery/useExplicitReturnType: See above.
  };
}
