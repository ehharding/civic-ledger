/**
 * Formats a positive integer with its English ordinal suffix: 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 22nd, …
 *
 * The 11th/12th/13th exception is why this can't just switch on the last digit — Congress numbers eventually reach the
 * hundreds (the 111th, 112th, and 113th Congresses already have), where a naive last-digit check would wrongly produce
 * "111st", "112nd", "113rd".
 *
 * @param value - The number to format. Fractional or negative input is not expected (every caller passes a Congress
 *   number or a district number) and is normalized to its absolute whole part rather than producing something like
 *   "2.5th".
 * @returns The number with its ordinal suffix, e.g., `formatOrdinal(119)` → `"119th"`.
 */
export function formatOrdinal(value: number): string {
  const whole: number = Math.abs(Math.trunc(value));
  const lastTwoDigits: number = whole % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return `${whole}th`;

  switch (whole % 10) {
    case 1:
      return `${whole}st`;
    case 2:
      return `${whole}nd`;
    case 3:
      return `${whole}rd`;
    default:
      return `${whole}th`;
  }
}

/**
 * Formats an ISO date for display, e.g., "July 14, 2026".
 *
 * `timeZone: "UTC"` is deliberate, not decorative: `Intl.DateTimeFormat` renders in the *runtime's local timezone* by
 * default, not UTC. Without pinning it, a text-version datetime like "2022-02-15T05:00:00Z" renders as "February 14" on
 * any machine set to a timezone west of UTC — which is most of the US. The date silently rolls back a day depending on
 * where the code happens to run, and server and browser can disagree about the same record.
 *
 * @param value - Either a bare `YYYY-MM-DD` date (as bill actions and CRS summaries use) or a full ISO 8601 datetime
 *   (as bill text versions use). Bare dates are anchored at midday UTC so no timezone can shift them across a day
 *   boundary.
 * @returns The formatted date, or `value` unchanged when it can't be parsed — an unrecognized string is more useful on
 *   screen than "Invalid Date".
 */
export function formatDate(value: string): string {
  const date: Date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(date.valueOf())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
