import { NextResponse } from "next/server";

import { getCongressApiKey } from "@/lib/congress/upstream/http";

// Forced dynamic so `timestamp` reflects the actual request time on the real (Vercel/Node) deployment — useful as a
// liveness signal. This can't be statically exported (see next.config.ts): the GitHub Pages static-demo workflow
// removes this route before building, the same way it already removes /api/bills.
export const dynamic = "force-dynamic";

/** The health check's response body. */
type HealthResponse = {
  status: "ok";
  service: string;
  /**
   * Which kind of record this deployment is currently able to serve.
   *
   * `"live"` when a Congress.gov key is configured, `"preview"` when one is not — in which case every page on the site
   * is rendering clearly labeled fiction. @see getCongressApiKey, which owns what "configured" means.
   */
  records: "live" | "preview";
  /** When this response was generated, so a cached or stale reply is recognizable as one. */
  timestamp: string;
};

/**
 * Minimal liveness check.
 *
 * Deliberately makes no upstream call: this answers "is the server up", not "is Congress.gov reachable". Folding the
 * latter in would make the app's own health depend on a third party's, and would turn every health probe into traffic
 * against the API's rate limit.
 *
 * **`records` is configuration state, not a reachability probe, and the distinction is what lets it live here.** This
 * app's defining behavior is that it degrades rather than fails: a missing key does not produce an error, a failed
 * request, or a non-200 anywhere — it produces a site that renders labeled preview fixtures and keeps serving them
 * indefinitely. That is correct for a reader and it means the single worst operational outcome this deployment has — a
 * key that was never set, expired, or got dropped from an environment during a migration — is invisible to every signal
 * an operator would normally watch. Uptime is green, error rate is zero, no exception is thrown, and the site is
 * publishing fiction. Reading a boolean off the environment costs nothing and no round trip, and turns that state into
 * something a probe can alert on.
 *
 * The value discloses nothing: the key itself is never read out, and a site in preview mode already says so in a banner
 * on every page it serves.
 *
 * @returns A fixed-shape JSON body with the current server time and which record set is in use.
 */
export function GET(): NextResponse<HealthResponse> {
  return NextResponse.json({
    status: "ok",
    service: "civic-ledger",
    records: getCongressApiKey() ? "live" : "preview",
    timestamp: new Date().toISOString(),
  });
}
