"use client";

import { Analytics, type BeforeSendEvent as AnalyticsEvent } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { ComponentProps, JSX } from "react";

import { redactUrl } from "@/lib/observability/redact";

/**
 * Vercel Web Analytics and Speed Insights (both cookieless), recording which pages are read and how fast they
 * render — nothing about the reader. {@link redactUrl} strips query strings, since directory URLs like
 * `/members?party=republican` would otherwise log what each reader looked for (see `docs/data-policy.md`). The same
 * function redacts Sentry's URLs.
 *
 * Both only report from a Vercel deployment (`/_vercel/…`); locally they log to the console, and the root layout leaves
 * them out of the static demo.
 */

/** Speed Insights' event shape, derived from its props since the package doesn't export it. */
type SpeedInsightsEvent = Parameters<NonNullable<ComponentProps<typeof SpeedInsights>["beforeSend"]>>[0];

/**
 * The analytics and performance collectors, mounted once for the whole site. A client component because `beforeSend` is
 * a function, which can't cross the server/client boundary.
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
