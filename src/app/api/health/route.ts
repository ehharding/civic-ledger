import { NextResponse } from "next/server";

import { getCongressApiKey } from "@/lib/congress/upstream/http";

/**
 * Forced dynamic so `timestamp` reflects the actual request time on the real (Vercel/Node) deployment — useful as a
 * liveness signal. This can't be statically exported (see next.config.ts): the GitHub Pages static-demo workflow
 * removes this route before building, the same way it removes `/api/bills`.
 */
export const dynamic = "force-dynamic";

/** The health check's response body. */
type HealthResponse = {
  status: "ok";
  service: string;
  /**
   * `"live"` when a Congress.gov key is configured, `"preview"` (labeled fixtures) otherwise.
   *
   * @see getCongressApiKey
   */
  records: "live" | "preview";
  /** When this response was generated, so a cached or stale reply is recognizable as one. */
  timestamp: string;
};

/**
 * Minimal liveness check. Makes no upstream call, so the app's health doesn't depend on Congress.gov or spend its rate
 * limit.
 *
 * `records` exposes configuration state because a missing key degrades silently — uptime green, no errors, the site
 * serving placeholders — and this lets a probe alert on it. It discloses nothing the preview banner doesn't.
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
