import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

/**
 * Access to the Postgres connection, on the same terms as {@link getCongressApiKey}: **configured is a question, not an
 * assumption.**
 *
 * A database is optional in this app and always has been. The GitHub Pages demo has no server to hold one, a local
 * checkout runs perfectly well without one, and the whole reading surface predates persistence entirely. So every
 * consumer asks {@link getDb} and handles `null`, rather than importing a connection that throws on a missing
 * environment variable at module load — which would take the app down at import time on the one deployment target that
 * can never have one.
 *
 * @see docs/deployment.md for provisioning and migrations.
 */

/**
 * How many connections one process opens.
 *
 * Deliberately small. The app's serving path reads the database only as a fallback when Congress.gov is unreachable,
 * and the sync job is a single scheduled request; neither wants a wide pool, and a serverless platform multiplies
 * whatever number is here by the number of warm instances. A managed pooler (Neon, Supabase, PgBouncer) is the right
 * place for concurrency, not this constant.
 */
const POOL_MAX_CONNECTIONS: number = 2;

/** Seconds an idle connection is kept before being closed — short, since instances are frequently discarded. */
const POOL_IDLE_TIMEOUT_SECONDS: number = 20;

/** The Drizzle handle this app uses. Named so consumers never restate the driver's own generic spelling. */
export type AppDatabase = PostgresJsDatabase;

/**
 * Reads the Postgres connection string.
 *
 * Read through this helper rather than `process.env` directly for the same reason {@link getCongressApiKey} exists: a
 * variable set to an empty or whitespace-only value — an easy thing to end up with after copying `.env.example` —
 * counts as *absent*, and takes the "no database configured" path rather than handing the driver a blank URL and
 * surfacing the resulting parse error as a mysterious outage.
 *
 * @returns The trimmed connection string, or `undefined` when none is usably configured.
 */
export function getDatabaseUrl(): string | undefined {
  const url: string = (process.env.DATABASE_URL ?? "").trim();
  return url.length > 0 ? url : undefined;
}

/**
 * The one connection this process opens, memoized against the URL that produced it.
 *
 * Keyed on the URL rather than held in a bare `let` so that changing `DATABASE_URL` yields a new handle instead of a
 * stale one — which matters in tests, where the alternative is exporting a reset hook that exists only for tests and
 * that production code has to be trusted never to call.
 */
let cached: { url: string; db: AppDatabase } | undefined;

/**
 * The database handle, or `null` when none is configured.
 *
 * Connecting is lazy: postgres.js opens a socket on the first query, not when the client is constructed, so calling
 * this on a request that ends up not needing the database costs nothing.
 *
 * `prepare: false` is required rather than preferred. Managed Postgres is commonly reached through a transaction-mode
 * pooler, where a prepared statement created on one backend connection is not there on the next one a query lands on —
 * a failure that appears only under concurrency and only in production.
 *
 * @returns The Drizzle handle, or `null` when `DATABASE_URL` is unset. Callers degrade; nothing here throws.
 */
export function getDb(): AppDatabase | null {
  const url: string | undefined = getDatabaseUrl();
  if (!url) return null;

  if (cached?.url === url) return cached.db;

  const client: Sql = postgres(url, {
    max: POOL_MAX_CONNECTIONS,
    idle_timeout: POOL_IDLE_TIMEOUT_SECONDS,
    prepare: false,
  });
  const db: AppDatabase = drizzle(client);

  cached = { url, db };

  return db;
}
