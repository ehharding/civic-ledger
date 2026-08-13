import * as Sentry from "@sentry/nextjs";

import { getCongressApiKey } from "@/lib/congress/upstream/http";
import { sentryInitOptions } from "@/lib/observability/sentry-options";

/**
 * Sentry for the Node.js runtime — every server component render, route handler, and upstream Congress.gov fetch.
 *
 * Kept to one call on purpose: the configuration itself lives in `sentry-options.ts`, where it can be read in one place
 * and unit-tested, rather than being spread across three near-identical files that drift.
 *
 * This is the runtime that holds the API key, which is why it is the one that passes it in. `getCongressApiKey()`
 * returns `undefined` when none is configured, and the redactor ignores empty entries — so the no-key preview path
 * needs no special case here.
 *
 * @see instrumentation.ts, which imports this file for the `nodejs` runtime only.
 */
Sentry.init(sentryInitOptions([getCongressApiKey() ?? ""]));
