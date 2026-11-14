import { expect } from "vitest";

/**
 * Shared fixtures for the suites that prove a secret never escapes: the error boundaries, the logger, the redactor, and
 * the Sentry configuration. Shared so every suite checks for the same spelling of the key.
 */

/** Stands in for a real Congress.gov key. Never a real one. */
export const FAKE_API_KEY: string = "SUPER-SECRET-KEY";

/** The `digest` Next attaches to a caught error, which correlates a log line with a failure and cannot be rendered. */
export const LEAKY_DIGEST: string = "1234567890";

/**
 * An error carrying exactly the kind of detail that must never be rendered: an upstream URL with the key still on it,
 * and a digest.
 */
export function leakyError(): Error & { digest?: string } {
  const error: Error & { digest?: string } = new Error(
    `Request failed: https://api.congress.gov/v3/bill/119?api_key=${FAKE_API_KEY}`,
  );
  error.digest = LEAKY_DIGEST;
  return error;
}

/**
 * Asserts that nothing from {@link leakyError} reached the rendered output — not the key, not the upstream host the URL
 * named, and not the digest.
 *
 * @param container - The rendered tree to search.
 */
export function expectNothingLeaked(container: Element): void {
  expect(container.textContent).not.toContain(FAKE_API_KEY);
  expect(container.textContent).not.toContain("api.congress.gov");
  expect(container.textContent).not.toContain(LEAKY_DIGEST);
}
