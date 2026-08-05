import { defineConfig, devices } from "@playwright/test";

/**
 * Browser-level checks. Vitest owns the unit and component half separately — see `vitest.config.mts` and the
 * `src/**\/*.test.tsx` files beside each component.
 */
const isCI: boolean = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    /**
     * CI drives the *production* build, which is the only build anyone is ever served. `pnpm dev` is Turbopack with
     * React in development mode: a different bundle, different code-splitting, unminified output, and no prerendering
     * of the routes `generateStaticParams` covers. Nothing in this suite is guaranteed to notice a regression that
     * only exists in one of those, and a browser check that never touches what ships has a gap exactly where it is
     * least visible.
     *
     * Locally it stays on the dev server, where a fast start and an already-running instance matter more than fidelity
     * and where `reuseExistingServer` means the run usually attaches to the one already open.
     */
    command: isCI ? "pnpm build && pnpm start" : "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !isCI,
    // The default 60s covers a dev server booting, not a production build running first.
    timeout: isCI ? 240_000 : 60_000,
  },
});
