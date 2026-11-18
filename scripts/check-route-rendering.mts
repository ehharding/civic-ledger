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

/** The only route prefixes allowed to render per request, for the reasons the module header gives. */
const ON_DEMAND_PREFIXES: readonly string[] = ["/api/", "/query/"];

/** One prerendered path's entry in `prerender-manifest.json`. */
type PrerenderedRoute = {
  /** The dynamic pattern the path was generated from, or `null` for a route that has no pattern of its own. */
  srcRoute: string | null;
};

/** The slice of `prerender-manifest.json` this check reads. */
type PrerenderManifest = {
  /** Every prerendered path, keyed by its concrete URL. */
  routes: Record<string, PrerenderedRoute>;
  /** Every dynamic route pattern that prerenders on demand (ISR), keyed by pattern. */
  dynamicRoutes: Record<string, unknown>;
};

/**
 * Reads one of `next build`'s manifests.
 *
 * @param file - A manifest's path relative to the build directory.
 * @returns The manifest, parsed.
 */
function readManifest<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), ".next", file), "utf8")) as T;
}

/** Every App Router route the build produced. */
const routes: string[] = Object.values(readManifest<Record<string, string>>("app-path-routes-manifest.json"));
/** The build's record of what it prerendered. */
const prerender: PrerenderManifest = readManifest<PrerenderManifest>("prerender-manifest.json");

/** Every route the build prerendered or will cache on first request, by its source pattern. */
const cached: Set<string> = new Set([
  ...Object.keys(prerender.dynamicRoutes),
  ...Object.entries(prerender.routes).map(
    ([route, entry]: [string, PrerenderedRoute]): string => entry.srcRoute ?? route,
  ),
]);

/** Routes that render per request without the prefix that permits it. */
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
      "what made it dynamic. See 'Keeping Server Work Bounded' in docs/deployment.md.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`All ${routes.length} routes are cached or on the on-demand allowlist (${ON_DEMAND_PREFIXES.join(", ")}).`);
