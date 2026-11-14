"use client";

import type { Route } from "next";
import Link from "next/link";
import { type ComponentProps, type JSX, useState } from "react";

/** Props for {@link RecordLink}: everything `next/link` takes, except the prefetch policy this component owns. */
export type RecordLinkProps = Omit<ComponentProps<typeof Link<Route>>, "prefetch">;

/**
 * An in-app link to one individual record — a bill, a member, a committee — or to a query-carrying view of one, which
 * prefetches on intent rather than on sight.
 *
 * **Why record links opt out of viewport prefetching.** `next/link` prefetches every link that scrolls into view, in
 * production only. For a link to one of a handful of static routes that is a free speed-up; for the links this app
 * renders by the dozen it is metered server work nobody asked for. Every record route is rendered on its first visit
 * and has a `loading.tsx`, so a viewport prefetch of one that is not yet cached is a server render — and a bill page's
 * render is eight Congress.gov requests. One reader opening `/members` would render every member page whose card they
 * scrolled past; one reader opening a committee page would render its `/query` twin once per record tab and pager step,
 * since those links each carry a query. That is the per-visit fan-out "Keeping Server Work Bounded"
 * (docs/deployment.md) exists to prevent, multiplied by the length of the list on screen.
 *
 * **Why not plain `prefetch={false}`.** In the App Router that disables hover prefetching as well, so the one link a
 * reader actually reaches for would arrive cold. This is the hover-intent pattern from Next's own prefetching guide
 * instead: prefetching stays off until a pointer enters the link or a finger lands on it, then reverts to the default.
 * The cost becomes one render per link a reader shows interest in, not one per link they scrolled past.
 *
 * Navigation links to the handful of top-level routes (the primary nav, the home page's calls to action) keep plain
 * `next/link`: those routes are static, so prefetching them costs a CDN hit rather than a render.
 *
 * @param props - @see RecordLinkProps. A caller's own `onMouseEnter` and `onTouchStart` still run, after the intent is
 *   recorded.
 * @returns A `next/link` that prefetches only once the reader shows intent.
 */
export function RecordLink(props: RecordLinkProps): JSX.Element {
  const { onMouseEnter, onTouchStart } = props;
  const [hasIntent, setHasIntent] = useState<boolean>(false);

  return (
    <Link
      {...props}
      // `null` is the default policy, spelled the way the guide spells it for "restore what Next would have done".
      prefetch={hasIntent ? null : false}
      onMouseEnter={(event): void => {
        setHasIntent(true);
        onMouseEnter?.(event);
      }}
      onTouchStart={(event): void => {
        setHasIntent(true);
        onTouchStart?.(event);
      }}
    />
  );
}
