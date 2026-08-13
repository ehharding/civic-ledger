import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// The default build is a full Next.js server app (Vercel or any Node host): dynamic routes, ISR, and a server-only
// Congress.gov API key all require it.
//
// Setting STATIC_EXPORT=true switches to `output: "export"` for a static GitHub Pages *demo* build. A static export
// cannot hold a secret API key, so that build always renders clearly labeled preview data — never live congressional
// records. See the "GitHub Pages" section of the README.
const isStaticExport: boolean = process.env.STATIC_EXPORT === "true";

// The path prefix every URL on the site sits under. Empty for the primary deployment, which is served from a domain
// root; the GitHub Pages demo lives at /<repo>, so that build sets it.
const basePath: string = isStaticExport ? (process.env.GITHUB_PAGES_BASE_PATH ?? "") : "";

// Whether this run should carry Sentry's build-time instrumentation at all.
//
// Everything that wrapper does — module instrumentation, release naming, source-map upload — pays off only in a build
// that is going to be deployed and reported from. `next dev` is neither: it has no DSN by default, uploads nothing, and
// pays the instrumentation cost on every route it compiles. Measured on this repo, that cost roughly doubled the cold
// dev-server compile and pushed `tests/e2e` past its navigation timeouts — a flaky browser job in CI, bought for
// nothing, since the SDK had no DSN to report to either way.
//
// The production build still exercises the whole wrapper, in `pnpm build` locally and in CI's `quality` job, so a
// Sentry-caused build failure surfaces before it ships rather than only on deploy.
const isSentryBuild: boolean = !isStaticExport && process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Next applies `basePath` to next/link, the router, and next/image — not to raw HTML attributes. The header's search
  // control is a plain `<form action>` precisely so it works with no JavaScript, which puts it outside that rewriting
  // and means it has to read the prefix itself. Exposed here so there is one source for it. @see SiteHeader.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // Playwright drives the dev server over 127.0.0.1 (see playwright.config.ts), which Next treats as a cross-origin
  // host distinct from localhost and refuses to serve dev-only assets to. Nothing in the suite depends on those assets,
  // so the run passed anyway — it just printed a block warning per page load, which is exactly the kind of routine
  // noise that trains you to stop reading e2e output. Development-only; the setting has no production effect.
  allowedDevOrigins: ["127.0.0.1"],
  ...(isStaticExport
    ? {
        output: "export",
        basePath,
        images: { unoptimized: true },
        // Swap the Sentry SDK for a no-op in the demo build. That build has no server at request time and never holds
        // a DSN, so the real SDK would initialize, find nothing to report to, and do nothing — after costing roughly
        // 65 KB gzipped, close to a third of the demo's JavaScript. Unlike the analytics gate below it, this one can
        // be resolved at bundle time, so the code is genuinely absent rather than merely unreachable.
        // @see src/lib/observability/sentry-stub.ts.
        turbopack: { resolveAlias: { "@sentry/nextjs": "./src/lib/observability/sentry-stub.ts" } },
      }
    : {}),
};

/**
 * The Sentry build step: source-map upload, and the release name that ties a stack trace to a commit.
 *
 * Skipped entirely for the static export, which is the same gate the analytics collectors already sit behind and for
 * the same reason. That build has no server to report from, must never hold a DSN or an auth token, and is published
 * from a workflow that has neither — so wrapping it would add a build step whose only possible outcomes are "no-op" and
 * "fails the demo deploy over a missing secret". Skipped in development too. @see isSentryBuild.
 *
 * Everything here is build-time only. What the SDK *collects at runtime* is decided in
 * `src/lib/observability/sentry-options.ts`, not here.
 */
export default isSentryBuild
  ? withSentryConfig(nextConfig, {
      // Read from the environment rather than hard-coded, so a fork reports to its own Sentry project instead of
      // silently failing to upload to this one.
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,

      // Source-map upload is the whole point of this wrapper: without it a production stack trace names
      // `page-4f2a9c.js:1:28471` instead of a file in `src/`. It only runs when the token is present, which means a
      // contributor's local `pnpm build` skips it rather than failing on a secret they have no reason to hold.
      authToken: process.env.SENTRY_AUTH_TOKEN,

      // Upload the maps, then delete them from the client bundle. Leaving them served alongside the app would publish
      // readable source for anyone who asks — harmless for a repository that is already public, and still the wrong
      // default to leave switched on in a project that may not always be.
      sourcemaps: { deleteSourcemapsAfterUpload: true },

      // Quiet locally, verbose in CI. A contributor running `pnpm build` has no use for upload diagnostics; a failed
      // deploy has nothing else to go on.
      silent: !process.env.CI,

      // Off. This sends the plugin's own errors and build timings to Sentry's internal telemetry, which is a
      // third-party report about this repository that nobody here asked for.
      telemetry: false,

      // Strips Sentry's own debug logging out of the bundle, which is dead weight in a production build. Spelled as
      // `bundleSizeOptimizations` rather than the shorter `disableLogger`, which is deprecated in favor of a
      // `webpack.treeshake.*` option — and this project builds with Turbopack, where a webpack-scoped setting silently
      // does nothing at all.
      bundleSizeOptimizations: { excludeDebugStatements: true },
    })
  : nextConfig;
