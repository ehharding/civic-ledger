import * as Sentry from "@sentry/nextjs";

import { sentryInitOptions } from "@/lib/observability/sentry-options";

/**
 * Sentry in the browser.
 *
 * No secrets are passed: the Congress.gov key never reaches a client bundle (`docs/data-policy.md` makes that a rule
 * rather than a habit), so there is no literal value for the redactor to strip here. The URL and query-string rules
 * still apply in full, and they matter more on this side than on the server — a client event's URL is the reader's
 * actual address bar, filters and search terms included.
 *
 * **No Session Replay, deliberately.** Replay is the headline feature of this SDK and it is the wrong feature for this
 * product: it records the DOM, and the DOM of this app is the congressional record a named reader was reading, plus
 * whatever they typed into a search box. Adding it would rebuild, in higher fidelity, exactly the dataset that
 * `redactUrl` and this module exist to refuse. If a future change wants it, that change needs an argument in
 * `docs/data-policy.md`, not a line here.
 */
Sentry.init(sentryInitOptions());

/**
 * Reports client-side navigations as transactions, so a slow route change is visible as itself.
 *
 * Required as a separate export: the App Router's navigations never reload the document, so without this hook every
 * page a reader visits after the first is invisible to tracing. Exported under the name Next.js looks for.
 */
export const onRouterTransitionStart: typeof Sentry.captureRouterTransitionStart = Sentry.captureRouterTransitionStart;
