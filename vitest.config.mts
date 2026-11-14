import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit and component tests. Browser-level checks live in `tests/e2e` under Playwright.
 *
 * `.mts` so Vite loads this as ESM directly, without declaring the whole package `"type": "module"`.
 */
export default defineConfig({
  resolve: {
    // Mirrors the `@/*` alias in tsconfig.json, which Vite doesn't read.
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",

    /**
     * One jsdom per worker rather than per file, with a fresh `vm` context per file so module state and mocks stay
     * isolated — about half the run time of the default `forks` pool. `isolate: false` would be faster still, but lets
     * one suite's mocks and module caches leak into the next.
     *
     * A file sees only its environment's globals. jsdom has no Web Streams, so a suite that needs them opts into
     * `// @vitest-environment node` (as `src/app/opengraph-image.test.tsx` does).
     */
    pool: "vmThreads",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],

    /**
     * Keeps the app's own `[civic-ledger]` log lines out of the output: the "degrades rather than crashes" tests write
     * dozens on purpose, and the assertions beside them already prove the failure was handled. This only affects
     * printing — tests can still spy on and assert against those lines. What console output is *allowed* is enforced by
     * the guard in `vitest.setup.ts`. Mirrors `LOG_PREFIX` in `src/lib/observability/log.ts`.
     */
    onConsoleLog: (log: string): boolean | undefined => (log.startsWith("[civic-ledger]") ? false : undefined),
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      // Explicit so files no test imports still show up in the report.
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/lib/congress/upstream/fixtures.ts",
        // Declarative Drizzle tables — nothing to exercise.
        "src/db/schema.ts",
        // Next.js's Sentry entry points: each only calls `Sentry.init` or re-exports an SDK hook on import. The options
        // they pass are tested where they're built, in `src/lib/observability/`.
        "src/instrumentation.ts",
        "src/instrumentation-client.ts",
        "src/sentry.*.config.ts",
      ],
      /**
       * 100% across the board, enforced by `pnpm check` (which runs `test:coverage`).
       *
       * Genuinely unreachable guards — `arr[i] ?? x` required by `noUncheckedIndexedAccess` inside a proven loop bound,
       * `map.get(k) ?? 0` right after `map.has(k)`, handlers on elements that only render when their state exists — are
       * excluded at their own lines with a `/* v8 ignore start *\/` … `/* v8 ignore stop *\/` pair and a one-line
       * reason (see CONTRIBUTING.md for why not `next`). Add one only when a test would have to fabricate a value the
       * app cannot produce; everything reachable gets a test.
       */
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
