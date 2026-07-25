/**
 * Resolves the bill directory's shareable `?q=` deep link from the request. Shared by both bill-directory routes
 * (`/bills` and `/bills/[congress]`) so they stay in sync rather than each re-implementing this guard.
 *
 * A static export has no server to read a request URL from at request time, so the deep link can't be honored there —
 * the directory still works, it just starts with an empty search (see the GitHub Pages section of the README). In
 * the normal server build, this reads the real query param.
 */
export async function resolveInitialQuery(searchParams: Promise<{ q?: string }>): Promise<string> {
  if (process.env.STATIC_EXPORT === "true") return "";

  const { q } = await searchParams;
  return q ?? "";
}
