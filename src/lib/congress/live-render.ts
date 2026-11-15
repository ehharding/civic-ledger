import { getCongressApiKey } from "@/lib/congress/upstream/http";

/**
 * Thrown by a cached route when a live read failed, so the degraded render is never written to the ISR cache.
 *
 * Next keeps serving the last good copy when a revalidation throws, and retries on the next request; a render with no
 * copy yet shows the error boundary, which is a 500 and never cached. Returning the degraded page instead stores it for
 * the route's whole window: a day for a concluded Congress's pages, and an outage-time bill lookup that resolved to
 * nothing was cached as that bill's 404.
 *
 * The message names the route and never the query, per `docs/data-policy.md`.
 */
export class LiveDataUnavailableError extends Error {
  /** @param route - The route pattern that refused to render, e.g., `/bills/[congress]/[type]/[number]`. */
  constructor(route: string) {
    super(`Congress.gov did not answer while rendering ${route}; keeping the last cached copy instead.`);
    this.name = "LiveDataUnavailableError";
  }
}

/**
 * Whether this process is serving cached routes at runtime: a production server, outside `next build`.
 *
 * The build is excluded because a throw there fails the deploy whenever Congress.gov is rate-limiting, and a prerender
 * is replaced on its first revalidation anyway. Dev and tests have no ISR cache to protect.
 *
 * @returns `true` on a deployed production server.
 */
function isServingCachedRoutes(): boolean {
  return process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";
}

/**
 * Throws {@link LiveDataUnavailableError} when a cached route's live read failed. Call it before `notFound()`, since a
 * failed lookup can look like a missing record.
 *
 * Only a failure counts: with no key configured, preview data is the intended output (the static demo, a fresh clone),
 * and with a key, a `preview` source only ever means Congress.gov did not answer.
 *
 * @param degraded - Whether any read this render depends on fell back.
 * @param route - The cached route's pattern, for the error message. `undefined` for an on-demand `/query` twin, whose
 *   render is never cached and so is better degraded than refused; the render functions they share take it from the
 *   cached caller only.
 * @throws {LiveDataUnavailableError} When `degraded` is true, `route` is given, a key is configured, and this is a
 *   production server.
 */
export function refuseDegradedRender(degraded: boolean, route: string | undefined): void {
  if (degraded && route !== undefined && getCongressApiKey() !== undefined && isServingCachedRoutes()) {
    throw new LiveDataUnavailableError(route);
  }
}
