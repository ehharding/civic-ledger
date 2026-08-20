import { defineConfig, devices } from "@playwright/test";

/**
 * Browser-level test configuration. Vitest owns the unit and component checks separately — see `vitest.config.mts` and
 * the `*.test.ts(x)` files beside each module.
 *
 * The split is by *what can be observed*, not by how heavy the test is. Vitest renders into jsdom, which has no layout
 * engine and no computed colors, so three of this project's stated commitments are invisible to it: the reflow promise
 * at 320px, the target-size floor, and every contrast token in both color schemes. Those live in `tests/e2e`, along
 * with the keyboard journeys through the chamber diagram. Everything a rendered tree can answer stays in Vitest, which
 * answers it in milliseconds.
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
    // to be told this host is expected — @see `allowedDevOrigins` in next.config.ts, which exists for this line.
    baseURL: "http://127.0.0.1:3000",
    // A full trace on every run is a large artifact for a suite that usually passes. On the first retry it is recorded
    // exactly when something has already failed once, which is the only time anyone opens one.
    trace: "on-first-retry",
  },
  // Chromium only. The checks here are about this app's own markup, geometry, and keyboard model rather than about
  // engine differences, and every one of them would assert the same thing three times over on three engines for triple
  // the CI minutes. Add a project when a finding is actually engine-specific.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The dev server rather than `next build && next start`, which is the deliberate half of this and worth knowing
    // before reading a failure. It costs a slower first navigation per route, since Turbopack compiles on demand — and
    // it is what lets these specs run against the same server a contributor already has open, with
    // `reuseExistingServer` below, instead of waiting on a production build to check whether a link works.
    //
    // What that trades away: this suite does not exercise the production build's output. The `quality` and
    // `static-export` jobs in ci.yml both build, so a change that only breaks under `next build` still fails CI — just
    // in a different job than this one.
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    // Reuse whatever is already listening locally; always start a fresh one in CI, where "already running" would mean a
    // leaked process from another job rather than the contributor's own dev server.
    reuseExistingServer: !process.env.CI,
  },
});
