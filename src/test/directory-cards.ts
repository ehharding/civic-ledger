import { screen } from "@testing-library/react";

/**
 * Reads a rendered directory the way its suites assert on it: by the names on its cards, in the order they appear.
 * Shared by the member and committee directory suites, whose cards both title themselves with a level-3 heading.
 */

/**
 * The names currently rendered as directory cards, in order.
 *
 * @returns Each card heading's text, skipping any that render empty.
 */
export function shownCardNames(): string[] {
  return screen
    .getAllByRole("heading", { level: 3 })
    .map((heading: HTMLElement): string => heading.textContent ?? "")
    .filter((name: string): boolean => name.length > 0);
}
