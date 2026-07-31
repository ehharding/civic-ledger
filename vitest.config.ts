import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit and component test configuration. Playwright owns the browser-level checks separately — see
 * `playwright.config.ts` and `tests/e2e`.
 */
export default defineConfig({
  resolve: {
    // Mirrors the `@/*` path alias in tsconfig.json. Vitest resolves through Vite rather than tsc, so the alias has to
    // be restated here; a mismatch between the two shows up as a test-only "cannot find module".
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
        // Preview fixtures are test data in their own right; measuring coverage of them says nothing useful.
        "src/lib/congress/fixtures.ts",
        // Declarative Drizzle table definitions — no branches, nothing to exercise.
        "src/db/schema.ts",
        // React Server Component shells and route-segment conventions (layouts, loading skeletons, error and not-found
        // boundaries, generated images). These are exercised by the Playwright suite, which renders them in a real
        // browser against a real server; a jsdom unit test of an async server component would assert far less than
        // that already does.
        "src/app/**/{layout,loading,error,not-found,opengraph-image,icon}.tsx",
      ],
    },
  },
});
