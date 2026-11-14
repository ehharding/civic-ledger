import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

import { type QueryRewrite, queryRewrites } from "@/lib/query-routes";

// The default build is a full Next.js server app: dynamic routes, ISR, and a server-only Congress.gov API key all need
// one. STATIC_EXPORT=true builds the GitHub Pages demo instead, which can't hold a secret and so always renders labeled
// preview data. See the "GitHub Pages" section of the README.
const isStaticExport: boolean = process.env.STATIC_EXPORT === "true";

// Empty for the primary deployment at a domain root; the Pages demo lives under /<repo>.
const basePath: string = isStaticExport ? (process.env.GITHUB_PAGES_BASE_PATH ?? "") : "";

// Sentry's build-time instrumentation only pays off in a deployed production build. In `next dev` it roughly doubles
// cold compiles (enough to push e2e navigations past their timeouts) with no DSN to report to.
const isSentryBuild: boolean = !isStaticExport && process.env.NODE_ENV === "production";

/**
 * Response headers on every document. Each states a browser default rather than inheriting it, so it can't change
 * without a diff here.
 *
 * `Referrer-Policy` matters most: a narrowed directory URL (`/bills?q=broadband`) is effectively a search log, and
 * `docs/data-policy.md` keeps it out of analytics and error reports. Cross-origin subresources such as Congress.gov
 * member portraits would otherwise send it in `Referer`. Outbound links already use `rel="noreferrer"`.
 *
 * There's no `Content-Security-Policy`: a useful one here needs per-request nonces, which would give up static
 * rendering. `docs/roadmap.md` tracks it under Deferred Tooling.
 */
const SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // If a CSP is added, move this into it as `frame-ancestors 'none'`.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Don't advertise the framework to scanners; nothing reads the header.
  poweredByHeader: false,
  // `basePath` isn't applied to raw HTML attributes, and the header's search is a plain `<form action>` so it works
  // without JavaScript. @see SiteHeader.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // Playwright drives the dev server over 127.0.0.1, which Next otherwise treats as a foreign origin. Dev-only.
  allowedDevOrigins: ["127.0.0.1"],
  ...(isStaticExport
    ? {
        output: "export",
        basePath,
        images: { unoptimized: true },
        // The demo has no server and no DSN, so swap Sentry (~65 KB gzipped) for a no-op at bundle time.
        // @see src/lib/observability/sentry-stub.ts.
        turbopack: { resolveAlias: { "@sentry/nextjs": "./src/lib/observability/sentry-stub.ts" } },
      }
    : {
        // `headers()` and `rewrites()` are server features; a static export would silently ignore them.
        headers: (): Promise<{ source: string; headers: { key: string; value: string }[] }[]> =>
          Promise.resolve([{ source: "/:path*", headers: [...SECURITY_HEADERS] }]),
        // Sends a URL with a view in its query string to that route's on-demand `/query` twin, so the route itself can
        // stay static. @see src/lib/query-routes.ts.
        rewrites: (): Promise<{ beforeFiles: QueryRewrite[] }> => Promise.resolve({ beforeFiles: queryRewrites() }),
      }),
};

/**
 * Sentry's build step: source-map upload and release naming. Build-time only — what the SDK collects at runtime is set
 * in `src/lib/observability/sentry-options.ts`.
 */
export default isSentryBuild
  ? withSentryConfig(nextConfig, {
      // From the environment, so a fork reports to its own project.
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // Upload runs only when the token is present, so a local `pnpm build` skips it rather than failing.
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Upload the maps, then keep them out of the public bundle.
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      silent: !process.env.CI,
      telemetry: false,
      // Turbopack-compatible replacement for the deprecated `disableLogger`.
      bundleSizeOptimizations: { excludeDebugStatements: true },
    })
  : nextConfig;
