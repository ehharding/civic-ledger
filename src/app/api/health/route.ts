import { NextResponse } from "next/server";

// Forced dynamic so `timestamp` reflects the actual request time on the real (Vercel/Node) deployment — useful as a
// liveness signal. This can't be statically exported (see next.config.ts): the GitHub Pages static-demo workflow
// removes this route before building, the same way it already removes /api/bills.
export const dynamic = "force-dynamic";

/** The health check's response body. */
type HealthResponse = {
  status: "ok";
  service: string;
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
 * @returns A fixed-shape JSON body with the current server time.
 */
export function GET(): NextResponse<HealthResponse> {
  return NextResponse.json({
    status: "ok",
    service: "civic-ledger",
    timestamp: new Date().toISOString(),
  });
}
