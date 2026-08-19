import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect } from "vitest";
import "@testing-library/jest-dom/vitest";

// @testing-library/react's auto-cleanup only self-registers for Jest; Vitest needs this explicitly.
afterEach((): void => {
  cleanup();
});

/**
 * The prefix this app's own log lines carry, which are the only console output a passing run may produce.
 *
 * Duplicated from `LOG_PREFIX` in `src/lib/observability/log.ts` rather than imported, because importing application
 * code into the setup file would load the observability module — and with it Sentry — before a single test has decided
 * whether it wants that. `vitest.config.mts` matches the same string in its `onConsoleLog` hook, and `log.test.ts` pins
 * the value, so a change there fails a test rather than quietly disarming this.
 */
const APP_LOG_PREFIX: string = "[civic-ledger]";

/**
 * The console methods a React warning can arrive on. `warn` is included because jsdom uses it for markup complaints.
 */
const GUARDED_LEVELS = ["error", "warn"] as const;

/** What a guarded call recorded: which method it came in on, and the message it carried. */
type CapturedLine = { level: (typeof GUARDED_LEVELS)[number]; message: string };

const originals: Map<string, typeof console.error> = new Map();
let captured: CapturedLine[] = [];

/**
 * Fails any test that provokes an unexpected `console.error` or `console.warn`.
 *
 * This exists because of a bug that reached `main` through a fully green `pnpm check`. A test rendered the same
 * amendment fixture twice, React warned that two children shared the key `119-SAMDT-2850`, and nothing failed — the
 * warning is not an exception, so the suite passed, and it was invisible in CI besides. Vitest only prints a passing
 * test's console output to a TTY, so the line showed up in an editor's run panel and in no pipeline anywhere. The
 * comment on `onConsoleLog` in `vitest.config.mts` claimed those warnings were "exactly the lines worth seeing"; they
 * were, and nobody was seeing them.
 *
 * A React key collision is not cosmetic. React is explicit that it may drop or duplicate the colliding children, so a
 * test that provokes one is asserting against a tree the framework does not promise to build. Printing that louder
 * would not have helped — output nobody reads is the thing that failed here. Turning it into a failed test is the only
 * form of it that cannot be scrolled past.
 *
 * **Opting out is deliberate and already idiomatic.** A test that expects a log line spies on the method
 * (`vi.spyOn(console, "warn").mockImplementation(…)`), which replaces this guard for that test and records
 * nothing — so the suites that assert on a log line keep working against the real thing, exactly as they did before.
 * That is the same escape hatch they were already using, rather than a new one this adds.
 *
 * The app's own `[civic-ledger]` lines pass through untouched. Roughly fifty of them are written deliberately by the
 * "degrades rather than crashes" tests, and they are handled failures with an assertion already standing beside
 * them — which is why `vitest.config.mts` hides them from the output and why they cannot fail a test here.
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
  for (const level of GUARDED_LEVELS) {
    const original: typeof console.error | undefined = originals.get(level);
    // Restored by assignment rather than by `vi.restoreAllMocks`, since the wrapper above is a plain assignment and not
    // a spy — several suites call `restoreAllMocks` in their own hooks, and this must survive that rather than depend
    // on it.
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
