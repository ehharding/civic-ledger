import { defineConfig, devices } from "@playwright/test";

/**
 * Browser-level test configuration, for what jsdom can't observe: 320px reflow, target sizes, contrast in both color
 * schemes, and keyboard journeys. Everything a rendered tree can answer stays in Vitest.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // Every spec here navigates and asserts against its own page, so nothing shares state and the suite is bounded by the
  // dev server rather than by test order.
  fullyParallel: true,
  // `.only` left in a spec would silently reduce CI to whatever it names. Biome's `noFocusedTests` catches it in
  // `src/`; this is the same rule for the half of the suite that runs here, enforced by the runner itself.
  forbidOnly: Boolean(process.env.CI),
  // Locally a failure is a failure — retrying it just delays the answer while someone watches. In CI a retry is worth
  // its cost because a real browser against a real dev server has failure modes a green rerun genuinely disproves: a
  // cold compile that outran a navigation timeout, a port still settling. The retry is also what makes `trace` below
  // useful, since the trace is recorded on the *first* retry rather than on every run.
  retries: process.env.CI ? 2 : 0,
  // Two reporters in CI, and the pairing is the point. The HTML report is the diagnosable one — it carries the trace,
  // the screenshots, and the DOM — and `ci.yml` uploads it as an artifact, but only on failure and only for someone
  // willing to download it. `list` puts the name of the failing test in the log itself, which is what the person
  // reading a red check actually sees first. Locally the HTML report alone is right: it opens on failure on its own.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "html",
  use: {
    // 127.0.0.1 rather than localhost, deliberately: Node resolves `localhost` to IPv6 first on some hosts while the
    // dev server binds IPv4, which fails as a connection refused that looks like a server that never started. Next has
    // to be told this host is expected — see `allowedDevOrigins` in next.config.ts, which exists for this line.
    baseURL: "http://127.0.0.1:3000",
    // A full trace on every run is a large artifact for a suite that usually passes. On the first retry it is recorded
    // exactly when something has already failed once, which is the only time anyone opens one.
    trace: "on-first-retry",
    // Every check here reads the page at rest — a computed color, a bounding box, a focused element — and the app's
    // entrance motion would otherwise put each of those briefly mid-flight: a section still fading in has a contrast
    // that axe will faithfully measure and nobody actually reads. Reduced motion is a mode the app fully supports
    // (every animation is gated on it; see src/styles/motion.css), so this tests a real configuration rather than a
    // stub.
    reducedMotion: "reduce",
  },
  // Chromium only: these checks are about this app's markup and keyboard model, not engine differences. The `warmup`
  // project (`.setup.ts`, never collected as a spec) compiles every route first. See tests/e2e/warmup.setup.ts
  projects: [
    { name: "warmup", testMatch: /\.setup\.ts$/ },
    { name: "chromium", testMatch: /\.spec\.ts$/, use: { ...devices["Desktop Chrome"] }, dependencies: ["warmup"] },
  ],
  webServer: {
    // The dev server, so specs can reuse one a contributor already has open. Production builds are exercised by the
    // `quality` and `static-export` CI jobs instead.
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    // Reuse whatever is already listening locally; always start a fresh one in CI, where "already running" would mean a
    // leaked process from another job rather than the contributor's own dev server.
    reuseExistingServer: !process.env.CI,
    // Ask the server to stop rather than killing it outright, which is what Playwright does when this is unset — a
    // SIGKILL to the process group it spawned. pnpm (12.6+) starts a script in a process group of its own, and a
    // SIGKILL cannot be forwarded: pnpm dies, `next dev` is orphaned still holding the run's stdout, and the run never
    // ends. A SIGTERM is one pnpm passes along, so Next shuts down with it.
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
