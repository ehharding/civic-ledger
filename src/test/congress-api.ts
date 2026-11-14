import { type Mock, vi } from "vitest";

/**
 * Helpers for suites that drive the Congress.gov adapter through a stubbed `fetch`, so a fake upstream answer has one
 * shape everywhere.
 *
 * Stubs set here are undone after each test by `vitest.setup.ts`.
 */

/**
 * Puts the adapter on its live path: configures a Congress.gov key and replaces `fetch` with `fetchMock`.
 *
 * @returns `fetchMock`, so a test can stub and keep a handle in one line.
 */
export function stubLiveApi<FetchMock extends Mock>(fetchMock: FetchMock): FetchMock {
  vi.stubEnv("CONGRESS_API_KEY", "test-key");
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

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
