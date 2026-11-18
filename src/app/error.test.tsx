/**
 * Covers the error boundary.
 *
 * The load-bearing assertion here is a negative one: the caught error never reaches the DOM. It can carry an upstream
 * response body or a fragment of a Congress.gov URL with the API key still in the query string, so "the page shows a
 * generic message" is a security property, not a copy decision. The test therefore throws an error whose message
 * *looks* like the thing that must not leak, and checks the rendered output for it.
 */
import { render, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The SDK is replaced rather than initialized. Importing the real one here would start a client whose only job is to
 * decide it has no DSN, and the thing worth asserting is not what Sentry does with the error — it is that this
 * component hands the error over at all. What the report may then *carry* is `sentry-options.test.ts`'s subject.
 */
const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (error: unknown): void => captureException(error),
  // `log.ts` reaches into this by level. Stubbed rather than omitted because omitting it would leave the logger's own
  // "never throw inside someone else's error path" guard swallowing a `TypeError` on every test in this file — a
  // passing suite that exercised none of the logging it is here to check.
  logger: { warn: (): void => {}, error: (): void => {} },
}));

import AppError from "@/app/error";
import { type DigestedError, expectNothingLeaked, FAKE_API_KEY, LEAKY_DIGEST, leakyError } from "@/test/leaky-error";

let user: UserEvent;

beforeEach((): void => {
  user = userEvent.setup();
  captureException.mockClear();
  vi.spyOn(console, "error").mockImplementation((): void => {});
});

describe("AppError", (): void => {
  it("shows a generic message rather than anything about the failure", (): void => {
    render(<AppError error={leakyError()} retry={(): void => {}} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("We Could Not Load This Civic Record.");
    expect(screen.getByText("Something Went Wrong")).toBeInTheDocument();
  });

  it("never puts the error, its digest, or an API key into the DOM", (): void => {
    const { container } = render(<AppError error={leakyError()} retry={(): void => {}} />);

    expectNothingLeaked(container);
  });

  it("logs the error instead, so it stays available where only operators can read it", (): void => {
    const error: DigestedError = leakyError();
    render(<AppError error={error} retry={(): void => {}} />);

    expect(console.error).toHaveBeenCalledWith(
      "[civic-ledger] Error boundary caught a render failure",
      expect.objectContaining({ event: "error-boundary.caught", digest: LEAKY_DIGEST }),
    );
  });

  it("strips the API key from the line it logs, which a bare `console.error` would not", (): void => {
    // The reason this boundary logs through `log.ts` at all. Sentry's callbacks redact only what goes to Sentry, and
    // the console — a real sink, and on a managed host a third-party one — is a separate path out of this process that
    // only `log.ts` redacts. The error this suite throws is the exact shape that makes skipping it a leak rather than a
    // tidiness problem: a URL with the credential still on it.
    render(<AppError error={leakyError()} retry={(): void => {}} />);

    const [, attributes] = vi.mocked(console.error).mock.calls[0] as [string, { cause?: string }];

    expect(attributes.cause).toContain("api_key=[redacted]");
    expect(attributes.cause).not.toContain(FAKE_API_KEY);
  });

  it("reports the error to Sentry, so a failure nobody saw is still a failure someone hears about", (): void => {
    const error: DigestedError = leakyError();
    render(<AppError error={error} retry={(): void => {}} />);

    expect(captureException).toHaveBeenCalledWith(error);
  });

  it("offers a retry, because most failures here are transient upstream ones", async (): Promise<void> => {
    const retry = vi.fn();
    render(<AppError error={leakyError()} retry={retry} />);

    await user.click(screen.getByRole("button", { name: "Try Again" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("re-logs when a different error arrives, rather than only on first mount", (): void => {
    const first: Error = leakyError();
    const { rerender } = render(<AppError error={first} retry={(): void => {}} />);
    expect(console.error).toHaveBeenCalledTimes(1);

    // Same props object identity would legitimately skip the effect; a genuinely new error must not.
    const second: Error = new Error("A different failure");
    rerender(<AppError error={second} retry={(): void => {}} />);

    expect(console.error).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenLastCalledWith(
      "[civic-ledger] Error boundary caught a render failure",
      expect.objectContaining({ cause: "Error: A different failure", digest: "none" }),
    );
    expect(captureException).toHaveBeenLastCalledWith(second);
  });

  it("still logs and reports a thrown value that is not an error at all", (): void => {
    // A Client Component can throw anything, and Next forwards it as-is. Reading `.digest` off it unguarded would turn
    // the boundary itself into the next crash, with nothing left above it to catch that one.
    render(<AppError error="a bare string" retry={(): void => {}} />);

    expect(console.error).toHaveBeenCalledWith(
      "[civic-ledger] Error boundary caught a render failure",
      expect.objectContaining({ cause: "a bare string", digest: "none" }),
    );
    expect(captureException).toHaveBeenCalledWith("a bare string");
  });
});
