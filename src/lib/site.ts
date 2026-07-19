/**
 * Resolves the canonical site URL for metadata, sitemap, and robots.txt.
 *
 * Priority: an explicit NEXT_PUBLIC_SITE_URL (set this in production), then Vercel's automatically injected deployment
 * URL, then a clearly fake placeholder so local/preview builds never accidentally imply a real production domain.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  return "https://civic-ledger.example";
}
