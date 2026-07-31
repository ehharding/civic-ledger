import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit and component test configuration. Playwright owns the browser-level checks separately — see
 * `playwright.config.ts` and `tests/e2e`.
 *
 * `.mts` rather than `.ts` so Vite loads this as the ES module it is written as. With a plain `.ts` extension and no
 * `"type": "module"` in package.json, Vite has to transpile it to CommonJS first — which still works today but warns,
 * and is slated to stop working when `configLoader: "native"` becomes the default. The alternative fix, declaring the
 * whole package as ESM, would change how `next.config.ts`, `drizzle.config.ts`, and `playwright.config.ts` load too;
 * this keeps the change to the one file that actually needs it.
 */
export default defineConfig({
  resolve: {
    // Mirrors the `@/*` path alias in tsconfig.json. Vitest resolves through Vite rather than tsc, so the alias has to
    // be restated here; a mismatch between the two shows up as a test-only "cannot find module".
    //
    // `import.meta.dirname` rather than `__dirname`, which does not exist in a module loaded as ESM.
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      // `text` for the terminal, `html` to browse a file line by line, `lcov` so CI and editors can read it.
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      // Stating `include` explicitly is what makes the report cover every source file rather than only the ones a test
      // happens to import. Without it, a module with no test at all is simply absent from the summary — which is
      // precisely the file worth knowing about.
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        // Shared test helpers. Test infrastructure, exercised entirely by the tests that import it — a coverage number
        // for it would only ever restate theirs.
        "src/test/**",
        // Preview fixtures are test data in their own right; measuring coverage of them says nothing useful.
        "src/lib/congress/fixtures.ts",
        // Declarative Drizzle table definitions — no branches, nothing to exercise.
        "src/db/schema.ts",
      ],
      /**
       * Ratchets, so a regression fails CI rather than waiting to be noticed in a diff.
       *
       * Every function and every line is covered. Route components — including the async server ones — are unit-tested
       * directly: an async component is a function returning an element, so it can be awaited and rendered like any
       * other. Playwright still owns the browser-level checks; these are the cheaper, more specific half.
       *
       * Statements and branches stop just short of 100, and the gap is deliberate rather than a backlog. What is left
       * is code that cannot be reached from *any* input, because the type system or the value's own construction has
       * already ruled the case out:
       *
       * - `arr[i] ?? fallback` guards required by `noUncheckedIndexedAccess`, over indices a loop bound has already
       *   proven valid (`seating.ts`, `sanitize-summary.ts`).
       * - `map.get(k) ?? 0` immediately after a `map.has(k)` filter (`member-filter.ts`, `committee-filter.ts`).
       * - Handlers guarding against state their own render condition excludes — `congress-seating-chart.tsx` attaches
       *   its keyboard handler to an `<svg>` that only exists when there is at least one seat.
       * - A `??` whose left side the model types as a required `string` (the bill route's metadata description).
       *
       * Writing a test for any of these would mean fabricating a value the app cannot produce, which pins the guard
       * rather than the behavior. Deleting them would mean trading a harmless safety net — and, for the indexed ones,
       * type safety itself — for a round number. Raise these figures when real coverage rises; do not chase them by
       * asserting against impossible inputs.
       */
      thresholds: { statements: 99.7, branches: 97.7, functions: 100, lines: 100 },
    },
  },
});
