/**
 * Every environment variable this project reads. With `noPropertyAccessFromIndexSignature` on, an undeclared name can't
 * be read with a dot, so a misspelling like `process.env.CONGRES_API_KEY` is a compile error rather than a silent
 * `undefined` that leaves the app on preview data.
 *
 * Every entry is optional: each read handles absence at runtime, and a local checkout leaves most of these empty.
 */

declare namespace NodeJS {
  // `interface`, not the house-style `type`, because only an interface can merge into Node's `ProcessEnv`.
  interface ProcessEnv {
    /**
     * The Congress.gov API key. **Server-only** — never `NEXT_PUBLIC_`, since the key travels in the request URL and a
     * browser request is a published key. Unset or blank switches the whole app to labeled preview fixtures.
     *
     * @see getCongressApiKey, which owns what "configured" means.
     */
    CONGRESS_API_KEY?: string;

    /**
     * Postgres connection string for the deferred persistence layer.
     *
     * @see drizzle.config.ts
     */
    DATABASE_URL?: string;

    /**
     * The canonical origin, with no trailing slash. First choice of {@link getSiteUrl}; unset, it falls through to the
     * two Vercel hostnames below and finally to a placeholder that is obviously not a real domain.
     */
    NEXT_PUBLIC_SITE_URL?: string;

    /**
     * The path prefix the site is served under, inlined at build time by `next.config.ts` so the header's plain
     * `<form action>` still resolves under the GitHub Pages project path. Empty everywhere else.
     */
    NEXT_PUBLIC_BASE_PATH?: string;

    /** Sentry's ingest address. Unset keeps the SDK switched off, which is the normal state of a local checkout. */
    NEXT_PUBLIC_SENTRY_DSN?: string;
    /** The environment reported alongside each event. Falls back to `NEXT_PUBLIC_VERCEL_ENV`, then to development. */
    NEXT_PUBLIC_SENTRY_ENVIRONMENT?: string;
    /** Trace sample rate, parsed from a string. Falls back to a fixed rate when unset or unparseable. */
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE?: string;

    /** The Sentry organization slug, for the CI-only source-map upload. */
    SENTRY_ORG?: string;
    /** The Sentry project slug, for the CI-only source-map upload. */
    SENTRY_PROJECT?: string;
    /** The source-map upload token. Build-time only; a local build without it skips the upload. */
    SENTRY_AUTH_TOKEN?: string;

    /** Set by `.github/actions/build-static-demo` to select the `output: "export"` build. The string `"true"`. */
    STATIC_EXPORT?: string;
    /** The base path that build is published under, e.g., `/civic-ledger`. Read only when `STATIC_EXPORT` is set. */
    GITHUB_PAGES_BASE_PATH?: string;

    /**
     * Injected by Vercel. The deployment's stable production hostname, without a scheme.
     *
     * @see getSiteUrl
     */
    VERCEL_PROJECT_PRODUCTION_URL?: string;
    /** Injected by Vercel. This deployment's hostname, without a scheme. The last hostname `getSiteUrl` tries. */
    VERCEL_URL?: string;
    /** Injected by Vercel: `production`, `preview`, or `development`. The Sentry environment's fallback. */
    NEXT_PUBLIC_VERCEL_ENV?: string;

    /**
     * Injected by Next per server runtime: `nodejs` or `edge`.
     *
     * @see src/instrumentation.ts, which branches on it.
     */
    NEXT_RUNTIME?: string;

    /** Set by the runner. Turns on `forbidOnly`, retries, and the list reporter in playwright.config.ts. */
    CI?: string;

    /** Read and rewritten by `format.test.ts`, which pins date formatting against a fixed zone. */
    TZ?: string;
  }
}
