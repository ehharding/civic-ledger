/**
 * Reads a route handler's response the way the API route suites assert on it: its status and its parsed body, typed as
 * the body `src/lib/api-contract.ts` declares for that route. Shared by the `/api/*` handler suites.
 */

/** A route handler's response, reduced to the two things its suite asserts on. */
export type RouteReply<Body> = {
  /** The HTTP status the handler answered with. */
  status: number;
  /** The parsed JSON body. */
  body: Body;
};

/**
 * Reads a handler's response into a {@link RouteReply}. Unlike `readApiResponse`, a non-2xx status is returned rather
 * than thrown, since the status is what these suites assert on.
 *
 * @typeParam Body - The route's declared response type, e.g., `BillPageResponse`.
 * @param response - What the handler returned.
 * @returns Its status and parsed body.
 */
export async function readRouteReply<Body>(response: Response): Promise<RouteReply<Body>> {
  return { status: response.status, body: (await response.json()) as Body };
}
