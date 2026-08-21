/**
 * Every environment variable this project reads, declared once.
 *
 * `.env.example` documents the ones a contributor fills in, and it is prose: nothing checks it, and nothing checks the
 * reads against it. Without this file `process.env` is an index signature, so `process.env.CONGRES_API_KEY` is a
 * perfectly well-typed expression that evaluates to `undefined` — and `undefined` is a value every read here already
 * has a graceful answer for. That is the specific failure this project keeps calling out elsewhere and had one more
 * of: the code compiles, `pnpm check` is green, and the app quietly serves preview data forever because a name was
 * misspelled once. @see the `@types/node` note in .github/dependabot.yml, which is the same argument about the same
 * class of silence.
 *
 * Declaring them turns that into a compile error, and `noPropertyAccessFromIndexSignature` in tsconfig.json is what
 * makes it one: with the rule on, an undeclared name cannot be reached with a dot at all, so a new variable has to be
 * added here — beside its documentation and its siblings — before it can be read anywhere. The rule is the enforcement
 * point; this file is the list it enforces against.
 *
 * Every entry is optional and every value is a string, which is what `process.env` actually offers. A variable that is
 * *required* is required at runtime rather than at the type level, and each read says so in its own way: `getSiteUrl`
 * falls back through Vercel's hostnames to a visibly fake placeholder, `getCongressApiKey` treats blank as unset, and
 * the Sentry options default to a switched-off SDK. None of them can be expressed as a non-optional string here without
 * lying about a local checkout, where nearly all of these are empty.
 */

declare namespace NodeJS {
  // `interface` rather than the `type` the house style calls for, because merging into Node's own `ProcessEnv` is the
  // entire mechanism here and `type` cannot merge. @see the `**/*.d.ts` override in biome.jsonc, which is where that
  // exception is stated and bounded.
  interface ProcessEnv {
    /**
     * The Congress.gov API key. **Server-only** — never `NEXT_PUBLIC_`, since the key travels in the request URL and a
     * browser request is a published key. Unset or blank switches the whole app to labeled preview fixtures.
     * @see getCongressApiKey, which owns what "configured" means.
     */
    CONGRESS_API_KEY?: string;

    /** Postgres connection string for the deferred persistence layer. @see drizzle.config.ts. */
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

    /**
     * Build-time only, and read solely to upload source maps from the GitHub Actions runner. A local `pnpm build` skips
     * the upload without the token rather than failing.
     */
    SENTRY_ORG?: string;
    SENTRY_PROJECT?: string;
    SENTRY_AUTH_TOKEN?: string;

    /** Set by `.github/actions/build-static-demo` to select the `output: "export"` build. The string `"true"`. */
    STATIC_EXPORT?: string;
    /** The base path that build is published under, e.g., `/civic-ledger`. Read only when `STATIC_EXPORT` is set. */
    GITHUB_PAGES_BASE_PATH?: string;

    /** Injected by Vercel. The deployment's stable production hostname, without a scheme. @see getSiteUrl. */
    VERCEL_PROJECT_PRODUCTION_URL?: string;
    /**
     * Injected by Vercel. This specific deployment's hostname, without a scheme. The last hostname `getSiteUrl` tries.
     */
    VERCEL_URL?: string;
    /** Injected by Vercel: `production`, `preview`, or `development`. The Sentry environment's fallback. */
    NEXT_PUBLIC_VERCEL_ENV?: string;

    /** Injected by Next per server runtime: `nodejs` or `edge`. @see src/instrumentation.ts, which branches on it. */
    NEXT_RUNTIME?: string;

    /** Set by the runner. Turns on `forbidOnly`, retries, and the list reporter in playwright.config.ts. */
    CI?: string;

    /** Read and rewritten by `format.test.ts`, which pins date formatting against a fixed zone. */
    TZ?: string;
  }
}
