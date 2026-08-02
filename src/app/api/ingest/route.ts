import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getCongressApiKey } from "@/lib/congress/client";
import { getIngestStore, type IngestStore } from "@/lib/ingest/store";
import { runIngestion, type SyncResult } from "@/lib/ingest/sync";

// NOTE: this route reads a request header and writes to the database, neither of which a static export can do — there
// is no server left at request time. The GitHub Pages static-demo workflow deletes it before building, the same way it
// already deletes /api/bills and /api/health.

/** Never cached and never prerendered: a sync is an action, and its result describes the moment it ran. */
export const dynamic = "force-dynamic";

/** The sync writes are only reachable from a Node runtime — `node:crypto` hashes here and in `records.ts`. */
export const runtime = "nodejs";

/** The response body, whether the run happened or was refused. */
type IngestResponse = {
  ok: boolean;
  /** Per-dataset outcomes when a run happened; absent when the request was refused before running. */
  results?: SyncResult[];
  /** Why a request was refused, or why the run is being reported as failed. */
  message?: string;
};

/**
 * Compares two secrets without leaking their difference through timing.
 *
 * Both sides are hashed first so the comparison operates on two equal-length digests: `timingSafeEqual` throws on a
 * length mismatch, and catching that throw would itself reveal the secret's length. Hashing makes every comparison the
 * same shape regardless of what was submitted.
 *
 * @param provided - The credential from the request.
 * @param expected - The configured secret.
 * @returns Whether they match.
 */
function secretMatches(provided: string, expected: string): boolean {
  const digest = (value: string): Buffer => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

/**
 * Reads the bearer credential from an `Authorization` header.
 *
 * @param request - The incoming request.
 * @returns The credential, or `null` when the header is absent or isn't a bearer scheme.
 */
function bearerToken(request: Request): string | null {
  const header: string = request.headers.get("authorization") ?? "";
  const [scheme, ...rest]: string[] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer") return null;

  const token: string = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

/**
 * Runs one scheduled ingestion pass.
 *
 * Driven by Vercel Cron (see `vercel.json`), which sends `Authorization: Bearer $CRON_SECRET`. It is a `POST` rather
 * than a `GET` because it changes state, which also means a crawler or a link preview cannot trigger it by following a
 * URL.
 *
 * The three refusals are kept distinct on purpose, because they need different responses from whoever sees them:
 *
 * - **No `CRON_SECRET`** → `503`. An unauthenticated write endpoint is worse than an absent one, so this route declines
 *   to run at all rather than defaulting open. There is no configuration in which "no secret set" should mean "anyone
 *   may sync".
 * - **Wrong credential** → `401`, with no detail. The response says nothing a prober could use.
 * - **No database or no API key** → `503`. Nothing is wrong; ingestion simply isn't configured on this deployment,
 *   which is a normal state for a checkout without persistence.
 *
 * @param request - The incoming request, whose `Authorization` header carries the cron secret.
 * @returns Per-dataset results, or the reason the run was refused. Reports `500` only when *every* dataset failed —
 *   which is the case a scheduler should surface as a failed invocation, while one dataset failing is a condition the
 *   run recorded and the next run can recover from on its own.
 */
export async function POST(request: Request): Promise<NextResponse<IngestResponse>> {
  const secret: string = (process.env.CRON_SECRET ?? "").trim();
  if (secret.length === 0) {
    return NextResponse.json(
      { ok: false, message: "Ingestion is disabled: CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  const provided: string | null = bearerToken(request);
  if (!provided || !secretMatches(provided, secret)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const store: IngestStore | null = getIngestStore();
  const apiKey: string | undefined = getCongressApiKey();

  if (!store || !apiKey) {
    return NextResponse.json(
      {
        ok: false,
        message: store
          ? "Ingestion needs a server-only Congress.gov API key."
          : "Ingestion needs DATABASE_URL to be configured.",
      },
      { status: 503 },
    );
  }

  const results: SyncResult[] = await runIngestion({ store, apiKey });
  const allFailed: boolean = results.every((result: SyncResult): boolean => result.status === "failed");

  return NextResponse.json({ ok: !allFailed, results }, { status: allFailed ? 500 : 200 });
}
