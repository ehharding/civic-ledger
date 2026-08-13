"use client";

import { Analytics, type BeforeSendEvent as AnalyticsEvent } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { ComponentProps, JSX } from "react";

import { redactUrl } from "@/lib/observability/redact";

/**
 * Vercel Web Analytics and Speed Insights, wired to record *which pages* are read and how fast they render — and
 * nothing about the reader.
 *
 * Both are cookieless and store no cross-site identifier, which is why they are the analytics this project can carry at
 * all. `docs/data-policy.md` states that no political-affiliation targeting or persuasion logic belongs in this
 * product, and that stance is worth nothing if the measurement layer quietly builds the profile the product refuses to
 * act on.
 * @see redactUrl for the one place that promise is actually enforced.
 *
 * Neither collector reports anywhere but a Vercel deployment with the corresponding feature switched on: both load
 * their scripts from `/_vercel/…`, a path only that platform serves. In local development they mount but detect the
 * development environment and log to the console instead of sending anything. In the static GitHub Pages demo they are
 * not mounted at all — @see the root layout, which is where that gate lives, since only a server component can read a
 * non-`NEXT_PUBLIC_` environment variable.
 */

/**
 * The load-bearing rule here is the URL cut, which lives in `src/lib/observability/redact.ts` as {@link redactUrl}.
 *
 * Every directory in this app mirrors its current view into the address bar (`/bills?q=broadband`,
 * `/members?party=republican&state=Ohio`), which is a feature — a narrowed directory is a place, so it has a URL — but
 * it means an unfiltered analytics feed would be a log of what each reader searched for and which party's members they
 * went looking at. That is precisely the dataset this project has said it will not build, and the fact that it would be
 * a *side effect* of a good feature rather than a decision anyone made is exactly why it is cut in a callback rather
 * than left to a dashboard setting someone could flip.
 *
 * What survives is the page: `/bills`, `/members`, `/committees/house/hsag00`. That answers "which parts of this are
 * worth keeping" without answering "who is reading it".
 *
 * The cut is shared with the error tracker rather than defined here, because Sentry collects the same URLs by default
 * and a promise kept by two copies of one function is a promise that survives until someone edits one of them. It lives
 * a level down rather than in this file specifically because this is a `"use client"` module: the server and edge
 * Sentry configs need the same function and must not pull a client component into their bundles.
 */

/**
 * Speed Insights' own event shape, recovered from the component's props.
 *
 * The package exports the component and the type of its `beforeSend`, but not the event that callback receives — so it
 * is derived here rather than restated by hand, which keeps this file correct through a version that changes it. The
 * analytics package exports its equivalent directly, which is why only one of the two needs this.
 */
type SpeedInsightsEvent = Parameters<NonNullable<ComponentProps<typeof SpeedInsights>["beforeSend"]>>[0];

/**
 * The analytics and performance collectors, mounted once for the whole site.
 *
 * A client component because `beforeSend` is a function, and a function cannot cross the server/client boundary as a
 * prop. Renders no markup of its own — both components return `null` and work entirely through injected scripts.
 *
 * @returns Both collectors, each already stripped of query strings.
 */
export function SiteAnalytics(): JSX.Element {
  return (
    <>
      <Analytics beforeSend={(event: AnalyticsEvent): AnalyticsEvent => ({ ...event, url: redactUrl(event.url) })} />
      <SpeedInsights
        beforeSend={(event: SpeedInsightsEvent): SpeedInsightsEvent => ({ ...event, url: redactUrl(event.url) })}
      />
    </>
  );
}
