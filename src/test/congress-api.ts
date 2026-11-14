import type { Mock } from "vitest";

/**
 * Helpers for suites that drive the Congress.gov adapter through a stubbed `fetch`.
 *
 * Every one of those suites used to declare its own copy of both functions below, word for word. They live here so the
 * shape of a fake upstream answer is decided once — a fixture that should look like Congress.gov should look like it
 * the same way everywhere.
 *
 * The API key itself is deliberately not wrapped. A suite sets it with `vi.stubEnv("CONGRESS_API_KEY", …)` and never
 * restores it: `vitest.setup.ts` unstubs every environment variable and global after each test, so a forgotten restore
 * cannot leak a key, or a missing one, into the next test.
 */

/**
 * A `Response` carrying `body` as JSON, the way Congress.gov answers.
 *
 * Builds a fresh object on every call. A `Response` body can only be read once, so a mock that must answer several
 * requests needs one per call — `mockImplementation(() => jsonResponse(…))` rather than `mockResolvedValue`.
 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * The URL a stubbed `fetch` was asked for on its `index`th call, parsed so a test can assert on its path and its query
 * parameters separately rather than on substrings of the whole.
 */
export function requestedUrl(fetchMock: Mock, index = 0): URL {
  return new URL(String(fetchMock.mock.calls[index]?.[0]));
}
