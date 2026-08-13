/**
 * What an error report is allowed to carry out of this app.
 *
 * Sentry's own documentation is explicit that, with `sendDefaultPii` off and every default in place, "the full request
 * URL of outgoing and incoming HTTP requests is always sent" — query string included. That default is fine for most
 * apps and wrong for this one twice over, for two unrelated reasons that happen to have the same fix:
 *
 * 1. **A Congress.gov key travels in the query string.** `buildCongressUrl` appends `api_key=…` to every outbound URL,
 *    so an unfiltered breadcrumb, span, or captured request is a published credential. `docs/data-policy.md` already
 *    states the key never reaches the browser; sending it to a third-party error tracker instead is the same leak with
 *    a longer flight path.
 * 2. **A reader's query string is the search log.** `/bills?q=broadband` and `/members?party=republican&state=Ohio` are
 *    a feature — a narrowed directory is a place, so it has a URL — and an unfiltered error feed of them is exactly the
 *    "who read what" dataset `docs/data-policy.md` says this product will not build. The analytics layer already
 *    refuses to collect it. An error tracker collecting it by default would be the same promise broken through a
 *    different door.
 *
 * So the rule is one line: **an error report names a page, never a query.** Everything in this module exists to keep
 * it, and it is kept in code that shows up in a diff rather than in a Sentry project setting someone can flip.
 *
 * These are pure functions over plain values, deliberately: they are the load-bearing half of the integration, and
 * every one of them is unit-tested against the shapes Sentry actually produces. The SDK wiring that installs them lives
 * in `sentry-options.ts`.
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
 * Object keys whose value is a whole URL, and which are therefore cut rather than pattern-scrubbed.
 *
 * Spelled as a set of exact names because these come from two vocabularies that both use short words: Sentry's own
 * event schema (`request.url`, `breadcrumb.data.url`) and OpenTelemetry's HTTP semantic conventions, which Sentry's
 * tracing emits (`http.url`, `url.full`). Matching on a substring like "url" instead would also catch `url_template`
 * and `image_url`, neither of which is a URL this app needs to cut.
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
 * Keys dropped outright rather than redacted, because the whole value is the thing being refused.
 *
 * `query_string` is Sentry's dedicated field for exactly what this module exists to not collect, and `cookies` is not
 * something a reading surface over public records has any reason to attach to a crash report.
 */
const DROPPED_KEYS: ReadonlySet<string> = new Set(["query_string", "cookies"]);

/**
 * Matches a Congress.gov credential wherever it appears inside a longer string.
 *
 * Free text is the case {@link redactUrl} cannot serve: a `fetch` rejection reads
 * `Request failed: https://api.congress.gov/v3/bill/119?api_key=SECRET`, and cutting that at its first `?` would throw
 * away the sentence to save the tail of it. This replaces the credential in place and leaves the message readable.
 *
 * Global and case-insensitive so a URL carrying it more than once, in any casing, is fully covered.
 */
const API_KEY_PATTERN: RegExp = /(\bapi_key=)[^&\s"'<>)\]}]*/gi;

/**
 * Cuts a URL down to the page it names, dropping the query string and fragment.
 *
 * The one cut both measurement layers make: the analytics collectors call it too. A promise kept by two separate copies
 * of a function is a promise that survives until someone edits one of them, so there is one copy and two callers. What
 * is left is `/bills`, `/members`, `/committees/house/hsag00`: enough to say which surface failed, and not enough to
 * say who was reading it or what they were looking for. It also removes `api_key=…` as a side effect, since that too
 * lives past the `?`.
 *
 * @param url - The URL a collector or error report was about to carry.
 * @returns The same URL with everything from the first `?` or `#` onward removed. A plain string cut rather than a
 *   `URL` round trip, because this runs inside callbacks the SDK invokes: `new URL` throws on input it can't parse, and
 *   a throw here would be a crash in someone else's error handler rather than a shorter report.
 */
export function redactUrl(url: string): string {
  const cut: number = url.search(/[?#]/);

  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * Removes credentials from a string that is not itself a URL.
 *
 * Two passes, because a secret can reach an event in two shapes. The pattern pass catches it still attached to its
 * parameter name, which is how it arrives inside an exception message or a span description. The literal pass catches
 * the raw value on its own, which is how it arrives from a captured local variable — `getCongressApiKey` returns the
 * key into a variable named `apiKey`, and a stack frame captured anywhere below that carries it with no `api_key=`
 * prefix for a pattern to find. The second pass is the one that makes this airtight rather than merely careful.
 *
 * @param text - Any string bound for Sentry.
 * @param secrets - Literal values that must never appear in an event, typically just the configured Congress.gov key.
 *   Empty and whitespace-only entries are ignored: `getCongressApiKey` already treats those as "no key configured", and
 *   replacing every empty substring would rewrite the string into nothing but markers.
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
 * Applies the rules above across a whole Sentry payload, wherever a string happens to sit in it.
 *
 * A walk rather than a list of known field paths, and that is the deliberate part. Sentry's event schema is large and
 * moves between minor versions, and the fields that carry a URL are contributed by several layers at once — the request
 * capture, the fetch breadcrumb, OpenTelemetry span attributes, and the stack-frame variable capture. Enumerating them
 * would mean a redaction that silently stops covering a field the day the SDK adds one. Walking every string means a
 * new field is covered before anyone here has heard of it.
 *
 * Each string is treated by where it sits: a value under a {@link URL_KEYS} key is a URL and gets cut, everything else
 * is free text and gets pattern-scrubbed. Keys in {@link DROPPED_KEYS} are removed entirely.
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
