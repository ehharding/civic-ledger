/**
 * Fails when a route outside `/api/*` and `/query/*` renders on every request — enforcing "Keeping Server Work Bounded"
 * (docs/deployment.md), since one stray `searchParams` read or uncached `fetch` silently makes a static route
 * per-visit.
 *
 * Run after `next build`. A route in `app-path-routes-manifest.json` but in neither `routes` nor `dynamicRoutes` of
 * `prerender-manifest.json` renders on demand. The prefixes are literal because bare Node can't resolve `@/` imports;
 * `/query` mirrors `QUERY_ROUTE_PREFIX` in `src/lib/query-routes.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

/** The only route prefixes allowed to render per request. @see the module header. */
const ON_DEMAND_PREFIXES: readonly string[] = ["/api/", "/query/"];

/** The slice of `prerender-manifest.json` this check reads. */
type PrerenderManifest = {
  routes: Record<string, { srcRoute: string | null }>;
  dynamicRoutes: Record<string, unknown>;
};

/**
 * @param file - A manifest's path relative to the build directory.
 * @returns The manifest, parsed.
 */
function readManifest<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), ".next", file), "utf8")) as T;
}

const routes: string[] = Object.values(readManifest<Record<string, string>>("app-path-routes-manifest.json"));
const prerender: PrerenderManifest = readManifest<PrerenderManifest>("prerender-manifest.json");

const cached: Set<string> = new Set([
  ...Object.keys(prerender.dynamicRoutes),
  ...Object.entries(prerender.routes).map(
    ([route, entry]: [string, { srcRoute: string | null }]): string => entry.srcRoute ?? route,
  ),
]);

const unexpected: string[] = routes
  .filter((route: string): boolean => !cached.has(route))
  .filter((route: string): boolean => !ON_DEMAND_PREFIXES.some((prefix: string): boolean => route.startsWith(prefix)))
  .sort();

if (unexpected.length > 0) {
  console.error(
    [
      "These routes render on every request, and only /api/* and /query/* are allowed to:",
      ...unexpected.map((route: string): string => `  ƒ ${route}`),
      "",
      "A per-visit render is metered server work. If the route reads its query, give it a /query twin; otherwise find",
      "what made it dynamic. @see 'Keeping Server Work Bounded' in docs/deployment.md.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`All ${routes.length} routes are cached or on the on-demand allowlist (${ON_DEMAND_PREFIXES.join(", ")}).`);
