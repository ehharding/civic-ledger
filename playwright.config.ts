import { defineConfig, devices } from "@playwright/test";

/**
 * Browser-level test configuration, for what jsdom can't observe: 320px reflow, target sizes, contrast in both color
 * schemes, and keyboard journeys. Everything a rendered tree can answer stays in Vitest.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // Every spec navigates to and asserts against its own page, so nothing shares state.
  fullyParallel: true,
  // Biome's `noFocusedTests` catches a stray `.only` in `src/`; this is the same rule for the e2e half.
  forbidOnly: Boolean(process.env.CI),
  // In CI a real browser against a dev server can fail on a cold compile or a settling port, which a rerun disproves.
  // Locally a retry only delays the answer.
  retries: process.env.CI ? 2 : 0,
  // In CI, `list` names the failing test in the log; the HTML report (trace, screenshots, DOM) is uploaded on failure.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "html",
  use: {
    // Not `localhost`: Node may resolve it to IPv6 while the dev server binds IPv4. See `allowedDevOrigins` in
    // next.config.ts, which exists for this line.
    baseURL: "http://127.0.0.1:3000",
    // Recorded only once a test has already failed, which is the only time anyone opens one.
    trace: "on-first-retry",
    // Every check reads the page at rest; entrance motion would put colors and boxes mid-flight. Reduced motion is a
    // fully supported mode (see src/styles/motion.css), so this tests a real configuration.
    reducedMotion: "reduce",
  },
  // Chromium only: these checks are about this app's markup and keyboard model, not engine differences. The `warmup`
  // project compiles every route first; see tests/e2e/warmup.setup.ts.
  projects: [
    { name: "warmup", testMatch: /\.setup\.ts$/ },
    { name: "chromium", testMatch: /\.spec\.ts$/, use: { ...devices["Desktop Chrome"] }, dependencies: ["warmup"] },
  ],
  webServer: {
    // The dev server, so specs can reuse one a contributor already has open. Production builds are exercised by the
    // `quality` and `static-export` CI jobs instead.
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    // Playwright's default is a SIGKILL, which pnpm (in its own process group) cannot forward: `next dev` is orphaned
    // holding the run's stdout and the run never ends. pnpm passes a SIGTERM along.
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
