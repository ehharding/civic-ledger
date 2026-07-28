/**
 * Resolves the canonical site URL used for metadata, the sitemap, and robots.txt.
 *
 * @returns The first of these that's set: an explicit `NEXT_PUBLIC_SITE_URL` (set this in production), Vercel's
 *   injected production URL, Vercel's per-deployment URL, or a clearly fake placeholder — so a local or preview build
 *   never accidentally emits canonical URLs implying a real production domain.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  return "https://civic-ledger.example";
}
