/**
 * The collator every alphabetical ordering in this app runs through.
 *
 * Pinned to one locale rather than left to `localeCompare`'s default, which is the *runtime's* locale — and the runtime
 * differs on the two sides of this app. The server orders a roster or a committee list before serializing it; the
 * browser re-orders the same list as the reader narrows. Where those two locales disagree the client-rendered order
 * differs from the server-rendered one, which is a hydration mismatch across an entire grid. The disagreement is real
 * rather than theoretical: `"Ødegård"` sorts before `"Zimmerman"` under `en-US` and after it under `da-DK` or `sv-SE`,
 * because those alphabets place Ø past Z. No sitting member's name triggers it today, which is exactly why it is worth
 * pinning — the failure would arrive with a new member rather than with a code change, and only for some readers.
 *
 * Constructed once rather than per comparison, which also matters at this size: ordering a full roster is a few
 * thousand comparisons, and every bare `localeCompare` call builds a collator of its own.
 *
 * Lives here, in the module every other layer already depends on, rather than beside any one of the models that order
 * things. One collator is what makes the guarantee above hold *everywhere* an ordering happens instead of only where
 * someone remembered to reach for it.
 */
const textCollator: Intl.Collator = new Intl.Collator("en-US");

/**
 * Orders two strings the way a reader of English expects.
 *
 * Collated rather than compared with `<`, so text carrying diacritics or apostrophes (Núñez, O'Halleran, Coeur d'Alene)
 * sorts where a reader expects rather than where its code points fall. Use this for anything a person reads as a name
 * or a place; ISO dates and other machine-formatted strings should be compared directly, since collation costs more and
 * buys nothing on ASCII digits.
 *
 * @param a - One string to compare.
 * @param b - The other string to compare.
 * @returns A standard comparator result. @see textCollator for why the locale is fixed.
 */
export function compareText(a: string, b: string): number {
  return textCollator.compare(a, b);
}

/**
 * Orders two ISO date strings newest first.
 *
 * Compared directly rather than through {@link compareText} or a `Date`. Every date this app sorts on is either a bare
 * `YYYY-MM-DD` (bill actions, CRS summaries) or a full ISO 8601 timestamp (bill text versions, committee history), and
 * both forms are fixed-width, zero-padded, and most-significant-field-first — so plain string comparison already *is*
 * chronological order. Collating them would cost more and buy nothing on ASCII digits, and constructing a `Date` per
 * comparison would buy nothing at all.
 *
 * Every newest-first ordering in the app goes through this one function, so "what happens to an undated record" has a
 * single answer rather than one per caller.
 *
 * @param a - One date to compare. An absent date should be passed as an empty string.
 * @param b - The other date to compare.
 * @returns A standard comparator result. Undated records sort last, together, and fall out of the comparison rather
 *   than needing a special case: an empty string is less than every real timestamp, and this order puts the greater
 *   value first.
 */
export function compareIsoDatesDesc(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? 1 : -1;
}

/**
 * Chooses the singular or plural form of a noun for a count.
 *
 * Stated once rather than inline at each count label (`n === 1 ? "Member" : "Members"`), which is the kind of thing
 * that quietly ends up saying "1 Members" the first time a new counter is added.
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
 * The date formatter every displayed date in this app is rendered through.
 *
 * Hoisted to module scope on exactly the reasoning stated for {@link textCollator} above, and it pays off in the same
 * kind of place: a committee's records page renders twenty dated rows, a member's page one per term plus one per bill
 * card, and a bill's page one per text version. `new Intl.DateTimeFormat(…)` resolves a locale and builds a pattern
 * every time it is called, which is the expensive part — `format` itself is cheap — so constructing one per date was
 * paying that cost once per row for a formatter that never varies.
 *
 * @see formatDate for why `timeZone: "UTC"` is load-bearing rather than decorative.
 */
const dateFormatter: Intl.DateTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

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

  return dateFormatter.format(date);
}

/**
 * The number formatter every count in this app is printed through.
 *
 * Constructed once for the same reason {@link textCollator} is, and it matters in the same place: a committee's records
 * page prints a count per collection tab and two more in its pager, above a list whose every row already calls
 * {@link formatDate}. `Intl` constructors are the expensive half of `Intl` — building a formatter costs far more than
 * using one — and `toLocaleString` builds a fresh one on every single call.
 */
const countFormatter: Intl.NumberFormat = new Intl.NumberFormat("en-US");

/**
 * Formats a whole number with thousands separators, e.g., `10205` → `"10,205"`.
 *
 * Five-figure counts are ordinary here — a long-lived committee has tens of thousands of bills referred to it — and an
 * unseparated "10205" is a number a reader has to count the digits of. Stated once rather than as a `toLocaleString`
 * call per site, on the rule the rest of this module holds: a display decision that lives in one place is one that
 * applies everywhere.
 *
 * @param value - The count to format.
 * @returns The separated number.
 */
export function formatCount(value: number): string {
  return countFormatter.format(value);
}
