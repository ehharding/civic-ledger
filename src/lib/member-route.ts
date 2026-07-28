import type { Route } from "next";

/**
 * Builds the in-app route to a member's page, e.g., `/members/L000174`.
 *
 * Shared by every place that links to a person — the chamber diagram's seats and read-out panel, a bill's sponsor line,
 * and the member page's own sponsored-bill cards — so none of them can drift out of sync with the route's shape.
 *
 * The Bioguide ID is the whole path: it's already unique, already stable (unlike a name slug, which changes when a
 * member's published name does), and already the identifier every other member-scoped thing in this app is keyed on.
 *
 * @param bioguideId - The member's Biographical Directory ID. Upper-cased so a link built from an inconsistently-cased
 *   upstream record still points at the same URL as every other link to that person.
 * @returns The typed in-app route, ready to hand to `next/link`.
 */
export function memberHref(bioguideId: string): Route {
  return `/members/${bioguideId.trim().toUpperCase()}` as Route;
}
