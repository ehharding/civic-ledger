/**
 * Covers the last-resort boundary, the one that runs when the root layout itself throws.
 *
 * The load-bearing assertion is the same negative one `error.test.tsx` makes, and it matters more here rather than
 * less. A root-layout failure is exactly where a half-initialized value carrying an upstream URL is most likely to be
 * the thing that threw, and there is no boundary left above this one to catch what it renders. So the test throws an
 * error whose message *looks* like the thing that must not leak, and checks the output for it.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked for the same reason as in error.test.tsx: the subject is the handoff, not what Sentry does.
const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (error: unknown): void => captureException(error),
  logger: { warn: (): void => {}, error: (): void => {} },
}));

import GlobalError from "@/app/global-error";
import { type DigestedError, expectNothingLeaked, FAKE_API_KEY, LEAKY_DIGEST, leakyError } from "@/test/leaky-error";

beforeEach((): void => {
  captureException.mockClear();
  vi.spyOn(console, "error").mockImplementation((): void => {});
});

describe("GlobalError", (): void => {
  it("shows a generic message rather than anything about the failure", (): void => {
    render(<GlobalError error={leakyError()} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Civic Ledger Could Not Start.");
    expect(screen.getByText("Something Went Wrong")).toBeInTheDocument();
  });

  it("never puts the error, its digest, or an API key into the DOM", (): void => {
    const { container } = render(<GlobalError error={leakyError()} />);

    expectNothingLeaked(container);
  });

  it("reports the error, which is the only signal this failure has", (): void => {
    // Nothing else is watching: there is no error boundary above this one, and in production no console either.
    const error: DigestedError = leakyError();
    render(<GlobalError error={error} />);

    expect(captureException).toHaveBeenCalledWith(error);
    expect(console.error).toHaveBeenCalledWith(
      "[civic-ledger] Global error boundary caught a root-layout failure",
      // `boundary` is what separates this from the segment boundary in a log query. Both write the same `event`, and
      // "the root layout failed" is a categorically worse fact than "a segment did" — so it has to be filterable.
      expect.objectContaining({ event: "error-boundary.caught", boundary: "global", digest: LEAKY_DIGEST }),
    );
  });

  it("strips the API key from the line it logs", (): void => {
    // See error.test.tsx. The same guarantee, asserted separately, because this boundary is the one that runs when the
    // thing that threw was the layout — the case likeliest to be holding a half-built upstream URL when it did.
    render(<GlobalError error={leakyError()} />);

    const [, attributes] = vi.mocked(console.error).mock.calls[0] as [string, { cause?: string }];

    expect(attributes.cause).toContain("api_key=[redacted]");
    expect(attributes.cause).not.toContain(FAKE_API_KEY);
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
