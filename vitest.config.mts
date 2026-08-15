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

    /**
     * Hides this app's own log lines from the run's output, and only those.
     *
     * A large part of this suite exists to prove that an upstream failure *degrades* rather than crashes — every
     * "falls back to preview data", "reports the outage as unavailable", and "returns what the surviving Congresses
     * found" test drives `requestCongressJson` through a rejected `fetch` on purpose. Each of those now writes a
     * deliberate `[civic-ledger] …` line, so a fully passing run printed about fifty of them, in six-line object
     * dumps, interleaved with the results. That is the specific kind of noise that teaches you to stop reading test
     * output — and the lines are worthless here, since the assertion beside them already proves the failure was
     * handled.
     *
     * Suppressed at the reporter rather than by stubbing `console` in `vitest.setup.ts`, which is the tempting fix and
     * the wrong one. This hook only decides what gets *printed*: `console.warn` and `console.error` still behave
     * normally inside a test, so the suites that assert on a log line — `log.test.ts`, `http.test.ts`, the three
     * `unavailable` tests — keep working against the real thing rather than against the harness.
     *
     * Prefix-matched rather than blanket-silenced, deliberately. Dropping every `stderr` would also drop React's "not
     * wrapped in act(…)" warnings and any genuinely unexpected error a test provokes, which are exactly the lines worth
     * seeing. @see LOG_PREFIX in src/lib/observability/log.ts, whose value this mirrors — the assertions in
     * `log.test.ts` pin the same string, so a change there fails a test rather than quietly un-hiding this.
     */
    onConsoleLog: (log: string): boolean | undefined => (log.startsWith("[civic-ledger]") ? false : undefined),
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
        "src/lib/congress/upstream/fixtures.ts",
        // Declarative Drizzle table definitions — no branches, nothing to exercise.
        "src/db/schema.ts",
        // The Sentry entry points Next.js requires by name. Each is a single `Sentry.init(sentryInitOptions(…))` or a
        // re-export of an SDK hook, and all of them initialize the SDK as a side effect of being imported — so a test
        // covering them would be a test of `Sentry.init`, run against a mock, asserting that a line that has no branch
        // was reached. The decisions those files pass along are unit-tested where they are made, in
        // `src/lib/observability/`, and that is deliberately not excluded here.
        "src/instrumentation.ts",
        "src/instrumentation-client.ts",
        "src/sentry.*.config.ts",
      ],
      /**
       * All four at 100, so any regression fails CI rather than waiting to be noticed in a diff.
       *
       * The enforcement point is `pnpm check`, which runs `test:coverage` rather than the bare suite for exactly this
       * reason: a threshold is only checked by the command that measures, so a `check` running plain `vitest run` — as
       * it once did — leaves everything below true of the config file and of nothing else.
       *
       * Route components — including the async server ones — are unit-tested directly: an async component is a function
       * returning an element, so it can be awaited and rendered like any other. Playwright still owns the browser-level
       * checks; these are the cheaper, more specific half.
       *
       * A round 100 is only honest because the handful of genuinely unreachable guards are excluded *at their own
       * lines*, with a `/* v8 ignore start *\/` … `/* v8 ignore stop *\/` pair and a one-line reason, rather than being
       * absorbed into a slack threshold here. The `start`/`stop` pair is the only spelling this provider honors
       * reliably — see "Before Opening a Pull Request" in CONTRIBUTING.md for why `next` is the wrong tool. Those are
       * cases no input can reach, because the type system or the value's own construction has already ruled them out:
       *
       * - `arr[i] ?? fallback` guards required by `noUncheckedIndexedAccess`, over indices a loop bound has already
       *   proven valid (`members/seating.ts`, `bills/sanitize-summary.ts`).
       * - `map.get(k) ?? 0` immediately after a `map.has(k)` filter (`members/filter.ts`, `committees/filter.ts`).
       * - Handlers guarding against state their own render condition excludes — `members/congress-seating-chart.tsx`
       *   attaches its keyboard handler to an `<svg>` that only exists when there is at least one seat.
       * - A `??` whose left side the model types as a required `string` (the bill route's metadata description).
       *
       * The rule that keeps this number meaningful: reach for a new ignore only when writing the test would mean
       * fabricating a value the app cannot produce — a test that pins a guard rather than a behavior. Everything
       * reachable gets a test instead.
       */
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
