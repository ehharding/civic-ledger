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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

/** An error carrying exactly the kind of detail that must never be rendered. */
function leakyError(): Error & { digest?: string } {
  const error: Error & { digest?: string } = new Error(
    "Request failed: https://api.congress.gov/v3/bill/119?api_key=SUPER-SECRET-KEY",
  );
  error.digest = "1234567890";
  return error;
}

let user: UserEvent;

beforeEach((): void => {
  user = userEvent.setup();
  captureException.mockClear();
  vi.spyOn(console, "error").mockImplementation((): void => {});
});

afterEach((): void => {
  vi.restoreAllMocks();
});

describe("AppError", (): void => {
  it("shows a generic message rather than anything about the failure", (): void => {
    render(<AppError error={leakyError()} reset={(): void => {}} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("We Could Not Load This Civic Record.");
    expect(screen.getByText("Something Went Wrong")).toBeInTheDocument();
  });

  it("never puts the error, its digest, or an API key into the DOM", (): void => {
    const { container } = render(<AppError error={leakyError()} reset={(): void => {}} />);

    expect(container.textContent).not.toContain("SUPER-SECRET-KEY");
    expect(container.textContent).not.toContain("api.congress.gov");
    expect(container.textContent).not.toContain("1234567890");
  });

  it("logs the error instead, so it stays available where only operators can read it", (): void => {
    const error: Error & { digest?: string } = leakyError();
    render(<AppError error={error} reset={(): void => {}} />);

    expect(console.error).toHaveBeenCalledWith(
      "[civic-ledger] Error boundary caught a render failure",
      expect.objectContaining({ event: "error-boundary.caught", digest: "1234567890" }),
    );
  });

  it("strips the API key from the line it logs, which the raw `console.error` it replaced did not", (): void => {
    // The reason this boundary logs through `log.ts` at all. `redact.ts` was wired into Sentry's callbacks only, so the
    // console — a real sink, and on a managed host a third-party one — was the single path out of this process with no
    // redaction on it. The error this suite throws is the exact shape that made that a leak rather than a tidiness
    // problem: a URL with the credential still on it.
    render(<AppError error={leakyError()} reset={(): void => {}} />);

    const [, attributes] = vi.mocked(console.error).mock.calls[0] as [string, { cause?: string }];

    expect(attributes.cause).toContain("api_key=[redacted]");
    expect(attributes.cause).not.toContain("SUPER-SECRET-KEY");
  });

  it("reports the error to Sentry, so a failure nobody saw is still a failure someone hears about", (): void => {
    const error: Error & { digest?: string } = leakyError();
    render(<AppError error={error} reset={(): void => {}} />);

    expect(captureException).toHaveBeenCalledWith(error);
  });

  it("offers a retry, because most failures here are transient upstream ones", async (): Promise<void> => {
    const reset = vi.fn();
    render(<AppError error={leakyError()} reset={reset} />);

    await user.click(screen.getByRole("button", { name: "Try Again" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("re-logs when a different error arrives, rather than only on first mount", (): void => {
    const first: Error = leakyError();
    const { rerender } = render(<AppError error={first} reset={(): void => {}} />);
    expect(console.error).toHaveBeenCalledTimes(1);

    // Same props object identity would legitimately skip the effect; a genuinely new error must not.
    const second: Error = new Error("A different failure");
    rerender(<AppError error={second} reset={(): void => {}} />);

    expect(console.error).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenLastCalledWith(
      "[civic-ledger] Error boundary caught a render failure",
      expect.objectContaining({ cause: "Error: A different failure", digest: "none" }),
    );
    expect(captureException).toHaveBeenLastCalledWith(second);
  });
});
