/**
 * Strips any trailing slashes from a resolved origin.
 *
 * Every caller of {@link getSiteUrl} except `metadataBase` builds its URLs by concatenation — `${siteUrl}/sitemap.xml`,
 * `${siteUrl}${route}` — so an origin carrying a trailing slash produces `https://example.org//sitemap.xml` in
 * robots.txt and a double slash on every entry in the sitemap. Crawlers treat that as a distinct path from the one the
 * app actually serves, which makes it the worst shape of mistake this project has: nothing errors, nothing looks wrong
 * in a build log, and the two files whose entire job is to tell a crawler where things are point at a URL that isn't
 * where they are.
 *
 * The value is copied out of a dashboard by hand, where a trailing slash is what a browser's address bar hands you when
 * you copy a site's root, so this normalizes rather than validates — the same choice every parser in
 * `src/lib/api-query.ts` makes, for the same reason: an operator's small formatting slip should resolve to the right
 * answer rather than to a broken artifact.
 *
 * `metadataBase` is unaffected either way, since `new URL()` normalizes the origin itself — which is precisely why this
 * had to be fixed here rather than left to each caller to remember.
 *
 * @param url - The origin as configured or injected.
 * @returns The same origin with no trailing slash.
 */
function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Resolves the canonical site URL used for metadata, the sitemap, and robots.txt.
 *
 * @returns The first of these that's set, with any trailing slash removed: an explicit `NEXT_PUBLIC_SITE_URL` (set this
 *   in production), Vercel's injected production URL, Vercel's per-deployment URL, or a clearly fake placeholder — so a
 *   local or preview build never accidentally emits canonical URLs implying a real production domain.
 *   @see withoutTrailingSlash for why the normalization belongs here rather than at each call site.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return withoutTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL);

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${withoutTrailingSlash(process.env.VERCEL_PROJECT_PRODUCTION_URL)}`;
  }

  if (process.env.VERCEL_URL) return `https://${withoutTrailingSlash(process.env.VERCEL_URL)}`;

  return "https://civic-ledger.example";
}
