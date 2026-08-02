import { drizzle } from "drizzle-orm/pg-proxy";

import type { IngestDatabase } from "@/lib/ingest/store";

/**
 * A real Drizzle handle whose transport is a function under the test's control.
 *
 * `drizzle-orm/pg-proxy` is a first-class driver: it builds the same statements through the same dialect that
 * postgres.js does, then hands the finished SQL and parameters to a callback instead of a socket. That is worth
 * considerably more here than a hand-rolled mock of Drizzle's fluent interface would be — a mock keeps returning
 * whatever it was told to long after the query it stands for has stopped being valid SQL, which is exactly the
 * regression a store's tests exist to catch.
 *
 * Rows are returned positionally, as the driver expects: one array per row, in the order of the selected fields.
 */

/** One statement the store issued, captured for assertion. */
export type ProxyCall = {
  sql: string;
  params: unknown[];
  method: "all" | "execute";
};

/** A proxy-backed database plus the log of everything it was asked to run. */
export type ProxyDatabase = {
  db: IngestDatabase;
  calls: ProxyCall[];
};

/**
 * Builds a proxy-backed database.
 *
 * @param respond - Returns the rows for a given statement, positionally. Defaults to returning none, which is the right
 *   default for a write whose result the test doesn't care about.
 * @returns The handle and the call log.
 */
export function createProxyDatabase(
  respond: (call: ProxyCall) => unknown[][] | Promise<unknown[][]> = (): unknown[][] => [],
): ProxyDatabase {
  const calls: ProxyCall[] = [];

  const db: IngestDatabase = drizzle(
    async (sql: string, params: unknown[], method: "all" | "execute"): Promise<{ rows: unknown[] }> => {
      const call: ProxyCall = { sql, params, method };
      calls.push(call);

      return { rows: await respond(call) };
    },
  );

  return { db, calls };
}
