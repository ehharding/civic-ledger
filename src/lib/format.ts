/**
 * Chooses the singular or plural form of a noun for a count.
 *
 * Every count label in this app was spelling this out inline (`n === 1 ? "Member" : "Members"`), which is both repeated
 * and the kind of thing that quietly ends up saying "1 Members" the first time a new counter is added.
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
 * Title-cases a short label, collapsing any irregular whitespace on the way through.
 *
 * Written for the free-text place names Congress.gov publishes, which are not guaranteed to arrive in one consistent
 * case — and where two spellings of the same jurisdiction would otherwise become two separate entries in a filter
 * control. @see normalizeJurisdiction, the only caller, which is where that boundary actually sits.
 *
 * Three rules make it safe to run over names rather than only over lower-cased input:
 *
 * - A word that is already mixed case (`"McCarthy"`) is left exactly as it arrived, since that casing was a decision.
 * - A dotted initialism (`"u.s."`) becomes `"U.S."` rather than `"U.s."`.
 * - Small words stay lower case in the middle of a label (`"District of Columbia"`) but not at either end.
 *
 * @param value - The label to case.
 * @returns The title-cased label, or an empty string for blank input. An all-caps word with internal capitals
 *   (`"MCCARTHY"`) becomes `"Mccarthy"` — the information needed to do better isn't in the string, which is why this is
 *   scoped to place names rather than offered as a general name formatter.
 */
export function toTitleCase(value: string): string {
  const words: string[] = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  return words
    .map((word: string, index: number): string => titleCaseWord(word, index === 0 || index === words.length - 1))
    .join(" ");
}

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
