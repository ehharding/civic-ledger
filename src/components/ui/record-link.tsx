"use client";

import type { Route } from "next";
import Link from "next/link";
import { type ComponentProps, type JSX, useState } from "react";

/**
 * Props for {@link RecordLink}: everything `next/link` takes, except the prefetch policy this component owns.
 *
 * `href` is restated as a `Route` rather than read off `Link` with `typeof Link<Route>`: `Link` is only generic once
 * `next dev` or `next build` has written the typed-route declarations into `.next/types`, and CI typechecks before
 * either has run, so that spelling compiled locally and failed there.
 */
export type RecordLinkProps = Omit<ComponentProps<typeof Link>, "prefetch" | "href"> & { href: Route };

/**
 * An in-app link to one record (or a query-carrying view of one) that prefetches on intent rather than on sight.
 *
 * Viewport prefetching would server-render every uncached record a reader scrolls past — eight Congress.gov requests
 * per bill page (docs/deployment.md, "Keeping Server Work Bounded"). Plain `prefetch={false}` also disables hover
 * prefetching, so this follows Next's hover-intent pattern: off until a pointer enters or a finger lands. Links to the
 * static top-level routes keep plain `next/link`.
 *
 * @param props - {@link RecordLinkProps}. A caller's own `onMouseEnter` and `onTouchStart` still run, after the intent
 *   is recorded.
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
