/**
 * What an error report is allowed to carry out of this app. **An error report names a page, never a query.**
 *
 * Sentry sends full request URLs by default, and here a query string holds either the Congress.gov key (`api_key=` on
 * every outbound URL) or a reader's search (`/bills?q=broadband`) — the "who read what" data `docs/data-policy.md`
 * refuses to collect. The rule lives in code rather than a Sentry project setting.
 *
 * Pure functions, unit-tested against the shapes Sentry produces; `sentry-options.ts` installs them.
 */

/** The redaction marker. Visible on purpose — a reader of an event should see that something was removed, not a gap. */
export const REDACTED: string = "[redacted]";

/**
 * How deep {@link redactEvent} walks before it stops descending.
 *
 * Sentry events nest a handful of levels at most (`contexts.trace.data.*`, `exception.values[].stacktrace.frames[]`),
 * so this is a runaway guard rather than a real limit — a cyclic or pathologically deep object must not be able to turn
 * a redaction pass into a hang inside someone else's error handler.
 */
const MAX_DEPTH: number = 12;

/**
 * Object keys whose value is a whole URL, so it's cut rather than pattern-scrubbed — from Sentry's schema and
 * OpenTelemetry's HTTP conventions. Exact names, since a substring match on "url" would catch `image_url`.
 */
const URL_KEYS: ReadonlySet<string> = new Set([
  "href",
  "http.url",
  "url",
  "url.full",
  "url.path",
  "referer",
  "Referer",
  "referrer",
  "server.address",
]);

/**
 * Keys dropped outright, because the whole value is what's being refused: Sentry's `query_string` and `cookies`, and
 * OpenTelemetry's `url.query` / `url.fragment` (a bare query has no `?` for {@link redactUrl} to cut at).
 */
const DROPPED_KEYS: ReadonlySet<string> = new Set(["query_string", "cookies", "url.query", "url.fragment"]);

/**
 * Matches a Congress.gov credential inside free text (e.g., a `fetch` error message containing a URL), replacing it in
 * place so the message stays readable. Global and case-insensitive.
 */
const API_KEY_PATTERN: RegExp = /(\bapi_key=)[^&\s"'<>)\]}]*/gi;

/**
 * Cuts a URL down to the page it names, dropping the query string and fragment (and with them any `api_key`). Shared by
 * error reporting and the analytics collectors.
 *
 * @param url - The URL a collector or error report was about to carry.
 * @returns The URL up to the first `?` or `#`. A string cut rather than `new URL`, which can throw inside the SDK's
 *   callbacks.
 */
export function redactUrl(url: string): string {
  const cut: number = url.search(/[?#]/);

  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * Removes credentials from a string that isn't itself a URL, in two passes: the pattern catches `api_key=…` in
 * messages, and the literal pass catches the bare key, as captured stack-frame variables carry it.
 *
 * @param text - Any string bound for Sentry.
 * @param secrets - Literal values that must never appear, typically the configured key. Blank entries are ignored.
 * @returns The string with every credential replaced by {@link REDACTED}.
 */
export function redactSecrets(text: string, secrets: readonly string[] = []): string {
  let output: string = text.replace(API_KEY_PATTERN, `$1${REDACTED}`);

  for (const secret of secrets) {
    if (secret.trim().length === 0) continue;
    output = output.split(secret).join(REDACTED);
  }

  return output;
}

/**
 * Applies the rules above across a whole Sentry payload. Walks every string rather than listing known fields, so a
 * field the SDK adds later is covered automatically: strings under {@link URL_KEYS} are cut, others are scrubbed, and
 * {@link DROPPED_KEYS} are removed.
 *
 * @typeParam Payload - The payload type, preserved so callers can hand back exactly what the SDK gave them.
 * @param payload - A Sentry event, transaction, or breadcrumb.
 * @param secrets - Literal values to strip, forwarded to {@link redactSecrets}.
 * @returns A redacted copy. The input is never mutated — the SDK hands over an object other handlers may still hold.
 */
export function redactEvent<Payload>(payload: Payload, secrets: readonly string[] = []): Payload {
  return redactValue(payload, secrets, false, 0, new WeakSet<object>()) as Payload;
}

/**
 * The recursive half of {@link redactEvent}.
 *
 * @param value - The current node.
 * @param secrets - Literal values to strip.
 * @param isUrl - Whether the key this value arrived under names a URL, which decides how a string here is treated.
 * @param depth - Current recursion depth, against {@link MAX_DEPTH}.
 * @param ancestors - The objects on the path from the root down to this node, so a cycle terminates instead of
 *   recurring forever. Deliberately the current path and not every object already visited: a Sentry event is a graph
 *   rather than a tree — the same `contexts` object, breadcrumb `data`, or stack frame can legitimately hang off two
 *   branches at once — and a set that never forgets would drop the second appearance of a shared node as though it
 *   were a cycle, quietly deleting present-and-fine data from the report.
 * @returns The redacted node.
 */
function redactValue(
  value: unknown,
  secrets: readonly string[],
  isUrl: boolean,
  depth: number,
  ancestors: WeakSet<object>,
): unknown {
  if (typeof value === "string")
    return isUrl ? redactUrl(redactSecrets(value, secrets)) : redactSecrets(value, secrets);

  // Past the depth cap, or round a cycle, the safe answer is to drop the subtree rather than to trust it: an
  // un-walked object is an un-redacted one, and a missing branch on an error report costs less than a leaked key.
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH || ancestors.has(value)) return undefined;

  ancestors.add(value);

  let output: unknown;
  if (Array.isArray(value)) {
    output = value.map((entry: unknown): unknown => redactValue(entry, secrets, isUrl, depth + 1, ancestors));
  } else {
    const record: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (DROPPED_KEYS.has(key)) continue;
      record[key] = redactValue(entry, secrets, URL_KEYS.has(key), depth + 1, ancestors);
    }
    output = record;
  }

  // Off the path again now that this node's children are done. A node is only a cycle if it is its own ancestor.
  ancestors.delete(value);

  return output;
}
