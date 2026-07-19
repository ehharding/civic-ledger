import { NextResponse } from "next/server";

// Safe to statically render: this route reads no request data, so it can be included in a STATIC_EXPORT=true build
// (see next.config.ts).
// Unlike /api/bills, it doesn't need real request-time behavior to be useful.
export const dynamic = "force-static";

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
