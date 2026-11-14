/**
 * Fails when a route outside the allowed set renders on every request.
 *
 * Run after `next build`, against the manifests it leaves in `.next/`. This is the enforcement point for the first rule
 * in "Keeping Server Work Bounded" (docs/deployment.md): every page is prerendered or regenerated on a window, and the
 * only routes allowed to render per visit are the `/api/*` handlers and the `/query/*` twins. That rule was a line in a
 * document asking a reviewer to read `pnpm build`'s route table for a stray `ƒ` — and the stray `ƒ` it guards against
 * is exactly what got this project's Vercel team paused. One `searchParams` read, one `cookies()` call, one uncached
 * `fetch` in a shared layout, and a static route quietly becomes a per-visit render that compiles, tests, and builds
 * clean. This turns that into a red CI check.
 *
 * The manifests are the build's own answer rather than a parse of its printed table: `app-path-routes-manifest.json`
 * lists every route, and `prerender-manifest.json` lists every one Next will serve from cache — `routes` for paths it
 * prerendered, `dynamicRoutes` for patterns it renders once per param and then caches. Anything in the first and in
 * neither of the others is rendered on demand.
 *
 * The prefixes are written out rather than imported from `src/lib/query-routes.ts`, because this runs under bare Node,
 * which has no `@/` alias to resolve the app's modules with — the same constraint that file's header describes for
 * `next.config.ts`. `/query` is `QUERY_ROUTE_PREFIX` there.
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
