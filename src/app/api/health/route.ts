import { NextResponse } from "next/server";

// Forced dynamic so `timestamp` reflects the actual request time on the real (Vercel/Node) deployment — useful as a
// liveness signal. This can't be statically exported (see next.config.ts): the GitHub Pages static-demo workflow
// removes this route before building, the same way it already removes /api/bills.
export const dynamic = "force-dynamic";

/**
 * Minimal liveness check. Returns a fixed shape with no upstream calls, so it stays fast and dependency-free — this
 * is "is the server up", not "is Congress.gov reachable".
 */
export function GET(): NextResponse<{ status: string; service: string; timestamp: string }> {
  return NextResponse.json({
    status: "ok",
    service: "civic-ledger",
    timestamp: new Date().toISOString(),
  });
}
