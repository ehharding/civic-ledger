import type { PageHeaderCopy } from "@/components/layout/page-header";

/**
 * The header copy the `/bills` route and its loading skeleton both render.
 *
 * The skeleton mirrors the real page's header exactly so that one resolves into the other without anything on screen
 * shifting. That was previously written down twice, with a comment in `loading.tsx` calling the duplication deliberate
 * because "matching it exactly is what makes the skeleton resolve into the real page without anything shifting" — which
 * is the argument for sharing it rather than against. Two copies can only *happen* to match; one copy cannot fail to.
 *
 * Only this route needs it. `/bills/[congress]` deliberately does *not* share its header with its own skeleton: Next
 * hands a route's loading UI no params, so that skeleton cannot know which Congress it is standing in for and says so
 * generically instead of guessing a number it would then have to flicker away from.
 */
export const CURRENT_CONGRESS_BILLS_HEADER: PageHeaderCopy = {
  eyebrow: "Legislation",
  title: "Start With the Record.",
  description: "Search the current Congress's bills, then follow each record back to its official Congress.gov source.",
};
