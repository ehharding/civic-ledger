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

import RouteError from "@/app/error";

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
  vi.spyOn(console, "error").mockImplementation((): void => {});
});

afterEach((): void => {
  vi.restoreAllMocks();
});

describe("RouteError", (): void => {
  it("shows a generic message rather than anything about the failure", (): void => {
    render(<RouteError error={leakyError()} reset={(): void => {}} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("We Could Not Load This Civic Record.");
    expect(screen.getByText("Something Went Wrong")).toBeInTheDocument();
  });

  it("never puts the error, its digest, or an API key into the DOM", (): void => {
    const { container } = render(<RouteError error={leakyError()} reset={(): void => {}} />);

    expect(container.textContent).not.toContain("SUPER-SECRET-KEY");
    expect(container.textContent).not.toContain("api.congress.gov");
    expect(container.textContent).not.toContain("1234567890");
  });

  it("logs the error instead, so it stays available where only operators can read it", (): void => {
    const error: Error & { digest?: string } = leakyError();
    render(<RouteError error={error} reset={(): void => {}} />);

    expect(console.error).toHaveBeenCalledWith("[error-boundary]", error);
  });

  it("offers a retry, because most failures here are transient upstream ones", async (): Promise<void> => {
    const reset = vi.fn();
    render(<RouteError error={leakyError()} reset={reset} />);

    await user.click(screen.getByRole("button", { name: "Try Again" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("keeps the site chrome, so a reader is not left with the Back button as their only move", (): void => {
    render(<RouteError error={leakyError()} reset={(): void => {}} />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse Bills" })).toHaveAttribute("href", "/bills");
  });

  it("re-logs when a different error arrives, rather than only on first mount", (): void => {
    const first: Error = leakyError();
    const { rerender } = render(<RouteError error={first} reset={(): void => {}} />);
    expect(console.error).toHaveBeenCalledTimes(1);

    // Same props object identity would legitimately skip the effect; a genuinely new error must not.
    const second: Error = new Error("A different failure");
    rerender(<RouteError error={second} reset={(): void => {}} />);

    expect(console.error).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenLastCalledWith("[error-boundary]", second);
  });
});
