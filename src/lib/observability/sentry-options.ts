import type * as Sentry from "@sentry/nextjs";

import { redactEvent } from "@/lib/observability/redact";

/**
 * The option bag `Sentry.init` accepts, recovered from the function rather than imported by name.
 *
 * `@sentry/nextjs` re-exports the three runtime SDKs and their integrations, but not the option type itself — it
 * declares it locally for `init`'s own signature and stops there. Deriving it from the function keeps this file
 * correct through a version that renames or restructures it, and avoids reaching past the installed package into
 * `@sentry/core`, which is a transitive dependency this project does not declare and should not import from.
 *
 * The same reasoning, and the same shape, as `SpeedInsightsEvent` in `site-analytics.tsx`.
 */
type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

/**
 * The three redaction callbacks, each recovered from the options bag for the same reason as {@link SentryInitOptions}.
 */
type BeforeSend = NonNullable<SentryInitOptions["beforeSend"]>;
type BeforeSendTransaction = NonNullable<SentryInitOptions["beforeSendTransaction"]>;
type BeforeBreadcrumb = NonNullable<SentryInitOptions["beforeBreadcrumb"]>;

/**
 * The single `Sentry.init` configuration, shared by all three runtimes.
 *
 * One object rather than three, because every rule that matters here is a rule about what leaves the process, and a
 * rule enforced in the browser but not on the server is not enforced. The three entry points Next.js requires
 * (`instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`) are deliberately thin: they call
 * `Sentry.init(sentryInitOptions(…))` and nothing else, so there is one place to read and one place to change.
 *
 * Every default this overrides is overridden for a stated reason. Sentry's defaults are sensible for a product whose
 * URLs are opaque and whose outbound requests carry credentials in headers; this app is neither.
 * @see redact.ts.
 */

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
 * Reads the deployment's environment name — the label that separates a real production crash from someone's laptop.
 *
 * **Set `NEXT_PUBLIC_SENTRY_ENVIRONMENT` on the deployment.** It is listed as optional in `docs/deployment.md` because
 * nothing breaks without it, which undersells it: what breaks is the labeling, quietly, and a production issue stream
 * labeled "development" is worse than one with no environments at all.
 *
 * The `NEXT_PUBLIC_VERCEL_ENV` fallback is a convenience, not a guarantee. A bare `VERCEL_ENV` is useless here because
 * this function also runs in the browser bundle, where only `NEXT_PUBLIC_`-prefixed values are inlined — and Vercel's
 * published list of system environment variables documents `VERCEL_ENV` without promising the prefixed twin. Where the
 * platform does supply it the fallback works; where it does not, this silently reports "development" from production,
 * which is exactly why the explicit variable is the supported path rather than the tidy one.
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
 * Reads the DSN that tells the SDK where to report.
 *
 * Read through a helper for the same reason `getCongressApiKey` is: a value set to an empty or whitespace-only string
 * (an easy thing to end up with after copying `.env.example`) counts as *absent*, so the SDK stays off rather than
 * initializing against a DSN it cannot use.
 *
 * Absence is a supported state, not a misconfiguration. It is how the static GitHub Pages demo ships without reporting,
 * and how a local checkout stays out of the project's issue stream — the same "no key configured, take the quiet path"
 * shape the Congress.gov adapter already uses.
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

    /**
     * What the SDK is allowed to gather before any of this app's own code sees it.
     *
     * This block and the three callbacks below do overlapping work, deliberately. This one is the SDK's own switch,
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
    },

    /**
     * The backstop. @see redact.ts for what each of these removes and why.
     *
     * All three are pure functions of their input and never throw: they run inside the SDK's own dispatch, where an
     * exception would be a crash in the error handler rather than a dropped field.
     */
    beforeSend: ((event) => redactEvent(event, secrets)) satisfies BeforeSend,
    beforeSendTransaction: ((event) => redactEvent(event, secrets)) satisfies BeforeSendTransaction,
    beforeBreadcrumb: ((breadcrumb) => redactEvent(breadcrumb, secrets)) satisfies BeforeBreadcrumb,
  };
}
