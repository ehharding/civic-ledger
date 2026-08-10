import type { Route } from "next";

/**
 * Builds the in-app route to a learning module, e.g., `/learn/how-a-bill-becomes-law`.
 *
 * The fourth member of the `*-route.ts` family, and it exists for the same reason the other three do: the lesson slug
 * is now written down once, in `src/lib/lessons.ts`, and read by the hub index, each lesson's own "read this next"
 * callout, the sitemap, and the route's `generateStaticParams`. A slug typed inline at any one of those is a lesson
 * that exists but cannot be reached from somewhere.
 *
 * @param slug - The lesson's slug, as its registry entry declares it.
 * @returns The typed in-app route, ready to hand to `next/link`.
 */
export function lessonHref(slug: string): Route {
  return `/learn/${slug.trim().toLowerCase()}` as Route;
}
