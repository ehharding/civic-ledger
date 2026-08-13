import * as Sentry from "@sentry/nextjs";

import { getCongressApiKey } from "@/lib/congress/upstream/http";
import { sentryInitOptions } from "@/lib/observability/sentry-options";

/**
 * Sentry for the Edge runtime.
 *
 * Nothing in this app opts into the edge runtime today — there is no middleware, and every route handler runs on Node.
 * The file exists anyway because Next.js decides the runtime, not this repository: an edge-rendered route added later
 * would otherwise report nothing at all, and a silent gap in error reporting is the failure mode an error tracker is
 * supposed to remove rather than introduce.
 *
 * The key is passed for the same reason as on the server. An edge route reading it would be a design mistake, but a
 * redactor that only guards the runtimes someone remembered is not a guard.
 *
 * @see instrumentation.ts, which imports this file for the `edge` runtime only.
 */
Sentry.init(sentryInitOptions([getCongressApiKey() ?? ""]));
