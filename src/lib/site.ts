/**
 * Strips trailing slashes from a resolved origin. Callers build URLs by concatenation, so a pasted `https://x.org/`
 * would otherwise put `//` paths in robots.txt and the sitemap.
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
 * @returns The first of `NEXT_PUBLIC_SITE_URL`, Vercel's production URL, Vercel's deployment URL, or a clearly fake
 *   placeholder, without a trailing slash.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return withoutTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL);

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${withoutTrailingSlash(process.env.VERCEL_PROJECT_PRODUCTION_URL)}`;
  }

  if (process.env.VERCEL_URL) return `https://${withoutTrailingSlash(process.env.VERCEL_URL)}`;

  return "https://civic-ledger.example";
}
