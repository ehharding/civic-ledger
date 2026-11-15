import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// @testing-library/react's auto-cleanup only self-registers for Jest; Vitest needs this explicitly.
afterEach((): void => {
  cleanup();
});

/**
 * The instant every test runs at. It sits inside the 119th Congress, the one the preview fixtures model, so anything
 * derived from "now" — `getCurrentCongress()`, the default Congress of every read, relative dates — gives the same
 * answer on any day the suite runs. `current-congress.test.ts` checks that this still lands on the fixtures' Congress.
 *
 * Only `Date` is replaced; timers stay real unless a test calls `vi.useFakeTimers()`, which keeps this instant as its
 * starting time. A test that needs a different "now" calls `vi.setSystemTime` itself.
 */
const TEST_NOW: Date = new Date("2026-07-15T12:00:00Z");

/**
 * Every test starts frozen at {@link TEST_NOW} and with no Congress.gov key, whatever the shell exports — so a
 * developer with a real key runs the same suite CI does, and a test that forgot to stub `fetch` can't spend that key. A
 * test that wants a key stubs one with `vi.stubEnv`.
 */
beforeEach((): void => {
  vi.setSystemTime(TEST_NOW);
  vi.stubEnv("CONGRESS_API_KEY", undefined);
});

/**
 * Undoes every clock change, `vi.stubEnv`, and `vi.stubGlobal` after each test, so no suite has to. Done here rather
 * than with `unstubEnvs`/`unstubGlobals` in `vitest.config.mts`, which restore *before* each test and so leak a file's
 * last stubs into the next file sharing the worker.
 */
afterEach((): void => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/**
 * The prefix on this app's own log lines — the only console output a passing test may produce. Mirrors `LOG_PREFIX` in
 * `src/lib/observability/log.ts` rather than importing it, since importing app code here would load Sentry before any
 * test has chosen to; `log.test.ts` pins the value so the two can't drift.
 */
const APP_LOG_PREFIX: string = "[civic-ledger]";

/** The console methods React and jsdom warn on. */
const GUARDED_LEVELS = ["error", "warn"] as const;

/** One console call made during a test, at a guarded level. */
type CapturedLine = { level: (typeof GUARDED_LEVELS)[number]; message: string };

/** The real console methods, restored after each test. */
const originals: Map<string, typeof console.error> = new Map();

/** The current test's console calls, checked when it ends. */
let captured: CapturedLine[] = [];

/**
 * Fails any test that provokes an unexpected `console.error` or `console.warn`.
 *
 * Warnings such as a React duplicate-key collision don't throw, and Vitest only prints a passing test's output to a
 * TTY, so without this they pass silently in CI. A test that expects a log line spies on the method
 * (`vi.spyOn(console, "warn").mockImplementation(…)`), which replaces this guard for that test. The app's own prefixed
 * lines always pass through.
 */
beforeEach((): void => {
  captured = [];

  for (const level of GUARDED_LEVELS) {
    originals.set(level, console[level]);

    console[level] = (...args: unknown[]): void => {
      const message: string = args.map((arg: unknown): string => String(arg)).join(" ");

      if (!message.startsWith(APP_LOG_PREFIX)) captured.push({ level, message });

      originals.get(level)?.(...args);
    };
  }
});

afterEach((): void => {
  // Restore spies first: a spy on `console.warn` sits over the guard's wrapper, so undoing it afterwards would leave a
  // stale wrapper for the next test to wrap again.
  vi.restoreAllMocks();

  for (const level of GUARDED_LEVELS) {
    const original: typeof console.error | undefined = originals.get(level);
    if (original) console[level] = original;
  }

  const unexpected: CapturedLine[] = captured;
  captured = [];

  expect(
    unexpected,
    `Unexpected console output during this test:\n${unexpected
      .map((line: CapturedLine): string => `  console.${line.level}: ${line.message}`)
      .join("\n")}\n\nIf the test means to provoke this, spy on the method and assert on it instead.`,
  ).toEqual([]);
});
