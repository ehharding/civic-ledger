/**
 * Covers the scheduled-ingestion endpoint.
 *
 * This is the app's only write endpoint, so most of what is worth pinning is what it refuses. The refusal that matters
 * most is the first one: with no `CRON_SECRET` configured it declines to run at all rather than defaulting open, since
 * an unauthenticated write endpoint is worse than an absent one and "no secret set" must never mean "anyone may sync".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/ingest/route";
import type { IngestStore } from "@/lib/ingest/store";
import * as store from "@/lib/ingest/store";
import type { SyncResult } from "@/lib/ingest/sync";
import * as sync from "@/lib/ingest/sync";

const SECRET: string = "correct-horse-battery-staple";
const originalSecret: string | undefined = process.env.CRON_SECRET;
const originalApiKey: string | undefined = process.env.CONGRESS_API_KEY;

type IngestBody = { ok: boolean; results?: SyncResult[]; message?: string };

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://civic-ledger.test/api/ingest", { method: "POST", headers });
}

function authorized(): Request {
  return request({ authorization: `Bearer ${SECRET}` });
}

async function post(input: Request): Promise<{ status: number; body: IngestBody }> {
  const response = await POST(input);
  return { status: response.status, body: (await response.json()) as IngestBody };
}

/** A store that does nothing, standing in for a configured database. */
function stubStore(): void {
  const stub: IngestStore = {
    latestWatermark: async () => null,
    upsertRecords: async () => 0,
    appendEvents: async () => 0,
    recordRun: async (): Promise<void> => undefined,
    listRecords: async () => [],
    findRecord: async () => null,
    recentRuns: async () => [],
  };

  vi.spyOn(store, "getIngestStore").mockReturnValue(stub);
}

function result(dataset: string, status: SyncResult["status"]): SyncResult {
  return { dataset, status, recordsSeen: 1, recordsWritten: 1, eventsAppended: 0, requestsMade: 1 };
}

beforeEach((): void => {
  vi.restoreAllMocks();
  process.env.CRON_SECRET = SECRET;
  process.env.CONGRESS_API_KEY = "test-key";
});

afterEach((): void => {
  vi.restoreAllMocks();
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
  if (originalApiKey === undefined) delete process.env.CONGRESS_API_KEY;
  else process.env.CONGRESS_API_KEY = originalApiKey;
});

describe("authorization", (): void => {
  /* Never defaults open. There is no configuration in which an unset secret should mean "anyone may sync". */
  it("refuses to run at all when no secret is configured", async (): Promise<void> => {
    delete process.env.CRON_SECRET;
    const runSync = vi.spyOn(sync, "runIngestion");

    const { status, body } = await post(authorized());

    expect(status).toBe(503);
    expect(body.message).toContain("CRON_SECRET");
    expect(runSync).not.toHaveBeenCalled();
  });

  it("treats a blank secret as no secret", async (): Promise<void> => {
    process.env.CRON_SECRET = "   ";

    expect((await post(authorized())).status).toBe(503);
  });

  it("rejects a missing, malformed, or empty credential", async (): Promise<void> => {
    expect((await post(request())).status).toBe(401);
    expect((await post(request({ authorization: SECRET }))).status).toBe(401);
    expect((await post(request({ authorization: "Basic abc123" }))).status).toBe(401);
    expect((await post(request({ authorization: "Bearer    " }))).status).toBe(401);
  });

  it("rejects the wrong credential without saying anything a prober could use", async (): Promise<void> => {
    const { status, body } = await post(request({ authorization: "Bearer wrong-secret" }));

    expect(status).toBe(401);
    expect(body.message).toBe("Unauthorized.");
  });

  /* The scheme is case-insensitive per RFC 7235, and a scheduler capitalizing it differently is not an intrusion. */
  it("accepts the bearer scheme in any case", async (): Promise<void> => {
    stubStore();
    vi.spyOn(sync, "runIngestion").mockResolvedValue([result("bills", "succeeded")]);

    expect((await post(request({ authorization: `BEARER ${SECRET}` }))).status).toBe(200);
  });
});

describe("preconditions", (): void => {
  it("reports that ingestion needs a database, when there is none", async (): Promise<void> => {
    vi.spyOn(store, "getIngestStore").mockReturnValue(null);

    const { status, body } = await post(authorized());

    expect(status).toBe(503);
    expect(body.message).toContain("DATABASE_URL");
  });

  it("reports that ingestion needs an API key, when there is none", async (): Promise<void> => {
    stubStore();
    delete process.env.CONGRESS_API_KEY;

    const { status, body } = await post(authorized());

    expect(status).toBe(503);
    expect(body.message).toContain("Congress.gov API key");
  });
});

describe("running", (): void => {
  it("reports each dataset's outcome", async (): Promise<void> => {
    stubStore();
    vi.spyOn(sync, "runIngestion").mockResolvedValue([result("bills", "succeeded"), result("members", "partial")]);

    const { status, body } = await post(authorized());

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.results?.map((entry: SyncResult): string => entry.dataset)).toEqual(["bills", "members"]);
  });

  /* One dataset failing is a condition the run recorded and the next run can recover from on its own; every dataset
     failing is what a scheduler should surface as a failed invocation. */
  it("still reports success when only some datasets failed", async (): Promise<void> => {
    stubStore();
    vi.spyOn(sync, "runIngestion").mockResolvedValue([result("bills", "failed"), result("members", "succeeded")]);

    const { status, body } = await post(authorized());

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("reports a failed invocation when every dataset failed", async (): Promise<void> => {
    stubStore();
    vi.spyOn(sync, "runIngestion").mockResolvedValue([result("bills", "failed"), result("members", "failed")]);

    const { status, body } = await post(authorized());

    expect(status).toBe(500);
    expect(body.ok).toBe(false);
  });
});
