/**
 * Covers the last-resort boundary, the one that runs when the root layout itself throws.
 *
 * The load-bearing assertion is the same negative one `error.test.tsx` makes, and it matters more here rather than
 * less. A root-layout failure is exactly where a half-initialized value carrying an upstream URL is most likely to be
 * the thing that threw, and there is no boundary left above this one to catch what it renders. So the test throws an
 * error whose message *looks* like the thing that must not leak, and checks the output for it.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** @see error.test.tsx, which mocks the SDK for the same reason: the subject is the handoff, not what Sentry does. */
const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException: (error: unknown): void => captureException(error) }));

import GlobalError from "@/app/global-error";

/** An error carrying exactly the kind of detail that must never be rendered. */
function leakyError(): Error & { digest?: string } {
  const error: Error & { digest?: string } = new Error(
    "Request failed: https://api.congress.gov/v3/bill/119?api_key=SUPER-SECRET-KEY",
  );
  error.digest = "1234567890";
  return error;
}

beforeEach((): void => {
  captureException.mockClear();
  vi.spyOn(console, "error").mockImplementation((): void => {});
});

afterEach((): void => {
  vi.restoreAllMocks();
});

describe("GlobalError", (): void => {
  it("shows a generic message rather than anything about the failure", (): void => {
    render(<GlobalError error={leakyError()} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Civic Ledger Could Not Start.");
    expect(screen.getByText("Something Went Wrong")).toBeInTheDocument();
  });

  it("never puts the error, its digest, or an API key into the DOM", (): void => {
    const { container } = render(<GlobalError error={leakyError()} />);

    expect(container.textContent).not.toContain("SUPER-SECRET-KEY");
    expect(container.textContent).not.toContain("api.congress.gov");
    expect(container.textContent).not.toContain("1234567890");
  });

  it("reports the error, which is the only signal this failure has", (): void => {
    // Nothing else is watching: there is no error boundary above this one, and in production no console either.
    const error: Error & { digest?: string } = leakyError();
    render(<GlobalError error={error} />);

    expect(captureException).toHaveBeenCalledWith(error);
    expect(console.error).toHaveBeenCalledWith("[global-error-boundary]", error);
  });

  it("offers a way out that does not depend on whatever just broke", (): void => {
    // A plain anchor rather than `next/link`: the router is part of the shell this boundary replaces, so a soft
    // navigation could re-enter the same failure. A full document load cannot.
    render(<GlobalError error={leakyError()} />);
    const link: HTMLElement = screen.getByRole("link", { name: "Return to the Overview" });

    expect(link).toHaveAttribute("href", "/");
  });

  it("re-reports when a different error arrives, rather than only on first mount", (): void => {
    const { rerender } = render(<GlobalError error={leakyError()} />);
    expect(captureException).toHaveBeenCalledTimes(1);

    const second: Error = new Error("A different failure");
    rerender(<GlobalError error={second} />);

    expect(captureException).toHaveBeenCalledTimes(2);
    expect(captureException).toHaveBeenLastCalledWith(second);
  });
});
