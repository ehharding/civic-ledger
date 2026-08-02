/**
 * Covers connection access.
 *
 * The property worth holding here is the one the whole ingestion layer is built on: **a database is optional.** Every
 * deployment target this app has ever had except one runs without persistence, so the interesting assertion is that an
 * unset — or blank — `DATABASE_URL` yields `null` rather than a thrown error at import time, which on the static
 * export would take the build down.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type AppDatabase, getDatabaseUrl, getDb } from "@/db/client";

const originalDatabaseUrl: string | undefined = process.env.DATABASE_URL;
const URL_ONE: string = "postgres://ledger:secret@localhost:5432/civic_ledger";
const URL_TWO: string = "postgres://ledger:secret@localhost:5432/civic_ledger_two";

beforeEach((): void => {
  delete process.env.DATABASE_URL;
});

afterEach((): void => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("getDatabaseUrl", (): void => {
  it("reports no URL when the variable is unset", (): void => {
    expect(getDatabaseUrl()).toBeUndefined();
  });

  /* The same rule `getCongressApiKey` follows, and for the same reason: a variable left blank after copying
     `.env.example` is an easy state to reach, and handing the driver an empty string surfaces a parse error where the
     honest answer is "not configured". */
  it("treats an empty or whitespace-only value as absent", (): void => {
    process.env.DATABASE_URL = "   ";
    expect(getDatabaseUrl()).toBeUndefined();

    process.env.DATABASE_URL = "";
    expect(getDatabaseUrl()).toBeUndefined();
  });

  it("trims the configured value", (): void => {
    process.env.DATABASE_URL = `  ${URL_ONE}  `;
    expect(getDatabaseUrl()).toBe(URL_ONE);
  });
});

describe("getDb", (): void => {
  it("reports no handle when no database is configured", (): void => {
    expect(getDb()).toBeNull();
  });

  it("builds a handle once a connection string exists", (): void => {
    process.env.DATABASE_URL = URL_ONE;

    expect(getDb()).not.toBeNull();
  });

  /* Connecting is lazy — postgres.js opens a socket on the first query — so building the handle costs nothing on a
     request that turns out not to need it, and these tests never touch a database. */
  it("reuses the same handle for the same URL", (): void => {
    process.env.DATABASE_URL = URL_ONE;

    const first: AppDatabase | null = getDb();
    const second: AppDatabase | null = getDb();

    expect(second).toBe(first);
  });

  /* Memoized against the URL rather than held in a bare `let`, so a changed URL yields a new handle instead of a stale
     one — which is what lets this be tested without a reset hook that exists only for tests. */
  it("builds a new handle when the URL changes", (): void => {
    process.env.DATABASE_URL = URL_ONE;
    const first: AppDatabase | null = getDb();

    process.env.DATABASE_URL = URL_TWO;
    const second: AppDatabase | null = getDb();

    expect(second).not.toBe(first);
  });
});
