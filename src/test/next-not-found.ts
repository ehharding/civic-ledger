import { expect } from "vitest";

/**
 * Shared assertion for "this route renders the 404 page".
 *
 * `notFound()` doesn't return a value a test can inspect — it throws a sentinel that Next catches upstream and turns
 * into the not-found boundary. Asserting on it by hand means every route test that has a miss case reaches into Next's
 * internals for the digest string, which is exactly the kind of thing that should be written down once.
 *
 * Checking the digest rather than merely that *something* threw is the point: a route that crashed on a null profile
 * also rejects, and a test that only asserted `.rejects.toThrow()` would call that a passing 404.
 */

/**
 * The digest Next attaches to the error `notFound()` throws. Not exported by `next/navigation` in any public form, so
 * it is pinned here — if a Next upgrade changes it, one test helper fails loudly rather than every route's miss case
 * quietly passing for the wrong reason.
 */
export const NEXT_NOT_FOUND_DIGEST: string = "NEXT_HTTP_ERROR_FALLBACK;404";

/**
 * Asserts that rendering a route triggered `notFound()`.
 *
 * @param render - Invokes the route component. Passed as a thunk rather than a promise so the rejection is awaited
 *   here, inside the assertion, rather than escaping as an unhandled rejection if the call throws synchronously.
 */
export async function expectNotFound(render: () => Promise<unknown>): Promise<void> {
  const error: unknown = await Promise.resolve()
    .then(render)
    .then((): unknown => null)
    .catch((thrown: unknown): unknown => thrown);

  expect(error, "expected the route to call notFound(), but it resolved").not.toBeNull();
  expect((error as { digest?: string }).digest).toBe(NEXT_NOT_FOUND_DIGEST);
}
