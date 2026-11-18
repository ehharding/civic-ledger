/**
 * The collator every alphabetical ordering in this app runs through.
 *
 * Pinned to one locale because the server and browser both sort the same lists, and differing runtime locales would
 * cause hydration mismatches (`"Ødegård"` sorts before `"Zimmerman"` in `en-US` but after it in `da-DK`). Built once,
 * since each bare `localeCompare` builds its own.
 */
const textCollator: Intl.Collator = new Intl.Collator("en-US");

/**
 * Orders two strings the way a reader of English expects (Núñez, O'Halleran). Use for names and places; compare ISO
 * dates directly.
 *
 * @param a - One string to compare.
 * @param b - The other string to compare.
 * @returns A standard comparator result.
 * @see textCollator for why the locale is fixed.
 */
export function compareText(a: string, b: string): number {
  return textCollator.compare(a, b);
}

/**
 * Any record ordered or labeled by its display name — a member, a committee, a subcommittee. Structural on purpose, so
 * the name comparators accept every shape that carries one without each record type declaring the relationship.
 */
export type NamedRecord = {
  /** The name as the record displays it, which is also the order a reader scans a list in. */
  name: string;
};

/**
 * Orders two ISO date strings newest first — the one newest-first ordering in the app. Plain string comparison is
 * chronological for fixed-width ISO dates and timestamps.
 *
 * @param a - One date to compare. Pass an absent date as an empty string.
 * @param b - The other date to compare.
 * @returns A standard comparator result. Undated records (empty strings) sort last.
 */
export function compareIsoDatesDesc(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? 1 : -1;
}

/**
 * Chooses the singular or plural form of a noun for a count.
 *
 * @param count - How many of the thing there are.
 * @param singular - The singular noun, cased as it should appear.
 * @param plural - The plural form, when it isn't just the singular plus "s" (e.g., `"Matches"`).
 * @returns The noun alone, so the caller composes the number and any surrounding copy itself.
 */
export function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/**
 * Words that stay lower case inside a title, unless they land at either end of it.
 *
 * Kept deliberately short and limited to what actually appears in the strings this is used on — jurisdiction names like
 * "District of Columbia" — rather than being a general English style guide.
 */
const TITLE_CASE_SMALL_WORDS: ReadonlySet<string> = new Set<string>([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "upon",
  "with",
]);

/** A dotted initialism such as `"U.S."` or `"D.C."`, which is upper-cased whole rather than title-cased. */
const DOTTED_INITIALISM: RegExp = /^(?:[a-z]\.)+$/i;

/**
 * Title-cases one whitespace-delimited word.
 *
 * @param word - The word to case.
 * @param isEdge - Whether it is the first or last word, where even a small word is capitalized.
 * @returns The cased word.
 */
function titleCaseWord(word: string, isEdge: boolean): string {
  if (DOTTED_INITIALISM.test(word)) return word.toUpperCase();

  // A word that is *already* mixed case was cased deliberately upstream — "McCarthy", "DeSoto", "O'Neill" — and
  // re-casing it would be a downgrade, so only all-lower and all-upper words are touched.
  if (word !== word.toLowerCase() && word !== word.toUpperCase()) return word;

  const lower: string = word.toLowerCase();
  if (!isEdge && TITLE_CASE_SMALL_WORDS.has(lower)) return lower;

  // Split on hyphens so "wilkes-barre" reads as "Wilkes-Barre" rather than "Wilkes-barre".
  return lower
    .split("-")
    .map((segment: string): string => (segment.length > 0 ? segment[0]?.toUpperCase() + segment.slice(1) : segment))
    .join("-");
}

/**
 * Title-cases a short label and collapses irregular whitespace, for Congress.gov's free-text place names.
 *
 * - A word that is already mixed case (`"McCarthy"`) is left exactly as it arrived, since that casing was a decision.
 * - A dotted initialism (`"u.s."`) becomes `"U.S."` rather than `"U.s."`.
 * - Small words stay lower case in the middle of a label (`"District of Columbia"`) but not at either end.
 *
 * @param value - The label to case.
 * @returns The title-cased label, or an empty string for blank input. `"MCCARTHY"` becomes `"Mccarthy"`, which is why
 *   this is for place names, not people.
 * @see normalizeJurisdiction, the only caller.
 */
export function toTitleCase(value: string): string {
  const words: string[] = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  return words
    .map((word: string, index: number): string => titleCaseWord(word, index === 0 || index === words.length - 1))
    .join(" ");
}

/**
 * Formats a positive integer with its English ordinal suffix, including the teens exception (111th, not "111st").
 *
 * @param value - The number to format; normalized to its absolute whole part.
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
 * The date formatter every displayed date runs through, built once since construction is the expensive part.
 *
 * @see formatDate for why `timeZone: "UTC"` matters.
 */
const dateFormatter: Intl.DateTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Formats an ISO date for display, e.g., "July 14, 2026". Rendered in UTC, since the runtime's local timezone would
 * shift "2022-02-15T05:00:00Z" to February 14 across most of the US, and server and browser could disagree.
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

  return dateFormatter.format(date);
}

/** The number formatter every count runs through, built once (`toLocaleString` builds one per call). */
const countFormatter: Intl.NumberFormat = new Intl.NumberFormat("en-US");

/**
 * Formats a whole number with thousands separators, e.g., `10205` → `"10,205"`.
 *
 * @param value - The count to format.
 * @returns The separated number.
 */
export function formatCount(value: number): string {
  return countFormatter.format(value);
}

/**
 * The small counts this app spells out in prose rather than printing as digits.
 *
 * Stops at ten because that is where the convention it encodes stops being worth keeping: a heading reading "Four
 * Walkthroughs" is prose, and one reading "Twenty-Three Walkthroughs" is a number pretending to be prose.
 */
const SPELLED_NUMBERS: readonly string[] = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
];

/**
 * Spells a small whole number in title case, so a heading like "Three Walkthroughs" is derived from its list rather
 * than typed and left to go stale.
 *
 * @param value - The count to spell. Fractional or negative input is normalized to its absolute whole part.
 * @returns The number in words and title case for zero through ten, and the digits for anything larger — where spelling
 *   it out would read worse than printing it.
 */
export function formatSpelledCount(value: number): string {
  const whole: number = Math.abs(Math.trunc(value));
  return SPELLED_NUMBERS[whole] ?? formatCount(whole);
}
