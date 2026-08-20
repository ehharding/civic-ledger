import type { Route } from "next";

import type { LessonSlug } from "@/lib/lessons";

/**
 * Builds the in-app route to a learning module, e.g., `/learn/how-a-bill-becomes-law`.
 *
 * The fourth member of the `*-route.ts` family, and it exists for the same reason the other three do: the lesson slug
 * is now written down once, in `src/lib/lessons.ts`, and read by the hub index, each lesson's own "read this next"
 * callout, the sitemap, and the route's `generateStaticParams`. A slug typed inline at any one of those is a lesson
 * that exists but cannot be reached from somewhere.
 *
 * The parameter is {@link LessonSlug} rather than `string`, which is what makes that promise hold at the two call sites
 * that *do* type a slug inline — the bill page's link to the voting module, the committee page's link to the committee
 * one. Those are the only places a slug is written outside the registry, and against a `string` parameter a typo in
 * either was a link that compiled, rendered, and 404'd. @see LessonSlug, whose whole purpose is to be that check;
 * before this it was a closed union nothing outside its own file consulted.
 *
 * @param slug - The lesson's slug, as its registry entry declares it.
 * @returns The typed in-app route, ready to hand to `next/link`.
 */
export function lessonHref(slug: LessonSlug): Route {
  return `/learn/${slug}` as Route;
}
