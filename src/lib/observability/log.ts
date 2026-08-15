import * as Sentry from "@sentry/nextjs";

import { redactSecrets } from "@/lib/observability/redact";

/**
 * The one way this app writes a log line, in every runtime.
 *
 * Before this module there were three `console.error` calls with three different prefixes, and between them they had
 * two problems that a fourth call would have inherited:
 *
 * 1. **They went nowhere anyone reads.** `requestCongressJson` catches every upstream failure — a 503 from
 *    Congress.gov, a revoked key, a stalled socket, a payload whose shape no longer matches `api-schema.ts` — and turns
 *    it into `{ outcome: "failed" }` so the page can degrade instead of crashing. That is the right behavior for a
 *    reader and it means the app's single most likely failure mode never throws, never reaches an error boundary, and
 *    never reaches `onRequestError`. The site quietly serves fallback content and the only trace is a line in a
 *    function log nobody is tailing. An error tracker that reports every failure *except* the common one is not
 *    reporting.
 * 2. **They were the one path out of this process with no redaction on it.** `redact.ts` is careful, thorough, and
 *    wired exclusively into Sentry's callbacks. `console.error(…, error)` bypassed all of it — and on a managed host a
 *    function log is a third-party sink like any other. The rule in `docs/data-policy.md` is about what leaves this
 *    process, not about which SDK carries it.
 *
 * So every log line is built here, redacted here, and sent to both places: `console` for whoever is tailing a terminal
 * or a log drain, and Sentry's structured logs for whoever is querying an incident afterwards. The two are the same
 * text by construction rather than by discipline.
 *
 * **Logs, not exceptions, for upstream trouble.** `Sentry.captureException` is deliberately not called from here. A
 * search sweep fans out one request per Congress — a couple of dozen in parallel — so a Congress.gov outage produces
 * hundreds of failures a minute, and filing each as an issue would bury the issue stream and exhaust the quota that
 * keeps this integration switched on at all (the same arithmetic `DEFAULT_TRACES_SAMPLE_RATE` is built on). Structured
 * logs are the right shape for high-volume, low-novelty facts: searchable, aggregatable, and attached to the trace that
 * produced them. Genuine crashes still call `captureException` from the error boundaries, where they belong.
 *
 * @see sentry-options.ts, which turns logs on and puts `beforeSendLog` in front of them.
 */

/**
 * The prefix on every console line this module writes.
 *
 * One string rather than the per-module tags it replaces (`[congress]`, `[error-boundary]`, `[global-error-boundary]`),
 * because the thing worth grepping a mixed log drain for is "a line this application wrote on purpose" — Next, React,
 * and the Sentry SDK all write to the same stream. What the line is *about* is the `event` attribute, which is a field
 * rather than a naming convention and can therefore be filtered on rather than matched by eye.
 */
const LOG_PREFIX: string = "[civic-ledger]";

/**
 * How much of a described cause is kept.
 *
 * An upstream error message is diagnostic in its first line and noise after it. The cap matters most for the values
 * that are not `Error`s at all: a rejected promise can carry an entire parsed response body, and a log line is not the
 * place to reproduce one.
 */
const MAX_CAUSE_LENGTH: number = 300;

/**
 * How far {@link describeCause} walks a `cause` chain.
 *
 * Node's `fetch` is the reason this is more than one. A DNS failure surfaces as `TypeError: fetch failed` with the
 * actual diagnosis — `getaddrinfo ENOTFOUND api.congress.gov` — one level down in `cause`, so a logger that prints only
 * the top of the chain reports that something failed and nothing about what.
 */
const MAX_CAUSE_DEPTH: number = 3;

/** Structured fields attached to a log line. Scalars only: an attribute is a thing to filter on, not a payload. */
export type LogAttributes = Record<string, string | number | boolean>;

/** Everything optional a caller can attach to a log line. */
export type LogDetails = {
  /** Structured fields, recorded alongside the message and searchable in Sentry. */
  attributes?: LogAttributes;

  /** The caught value, when there is one. Described rather than logged whole — @see describeCause. */
  cause?: unknown;

  /**
   * Literal values that must never appear in the line, forwarded to {@link redactSecrets}.
   *
   * Passed by the caller rather than read here, which is the same division `sentry.server.config.ts` and
   * `instrumentation-client.ts` already make: the module holding a secret is the one that declares it. Reading
   * `getCongressApiKey` in this file instead would import the upstream adapter into every client bundle that logs, and
   * would make this module and `http.ts` — its main caller — import each other.
   */
  secrets?: readonly string[];
};

/**
 * Renders a caught value as one short, redacted line.
 *
 * @param cause - Anything a `catch` can bind, which is genuinely anything.
 * @param secrets - Literal values to strip, forwarded to {@link redactSecrets}.
 * @returns A single-line description, capped at {@link MAX_CAUSE_LENGTH}, or `undefined` when there was nothing to
 *   describe. `Error`s are rendered as `Name: message`, following the `cause` chain so the useful half of a wrapped
 *   `fetch` failure survives; anything else is stringified defensively, since a thrown value can have a `toString` that
 *   itself throws and a logger is the last place that should be the thing that fails.
 */
export function describeCause(cause: unknown, secrets: readonly string[] = []): string | undefined {
  if (cause === undefined || cause === null) return undefined;

  const parts: string[] = [];
  let current: unknown = cause;

  for (let depth: number = 0; depth < MAX_CAUSE_DEPTH && current !== undefined && current !== null; depth++) {
    if (current instanceof Error) {
      parts.push(`${current.name}: ${current.message}`);
      current = current.cause;
      continue;
    }

    parts.push(stringifyUnknown(current));
    break;
  }

  const described: string = redactSecrets(parts.join(" <- "), secrets);

  return described.length > MAX_CAUSE_LENGTH ? `${described.slice(0, MAX_CAUSE_LENGTH)}…` : described;
}

/**
 * Turns a non-`Error` thrown value into a string without trusting it.
 *
 * @param value - The thrown value.
 * @returns Its string form, or a fixed placeholder when producing one throws — which a value with a hostile or
 *   half-initialized `toString` can do, and which must not take the log line down with it.
 */
function stringifyUnknown(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "[unserializable]";
  }
}

/**
 * Strips secrets from every string in an attribute bag, leaving other scalars alone.
 *
 * The `beforeSendLog` hook in `sentry-options.ts` does this again for the Sentry copy. This pass is what covers the
 * console copy, which no SDK callback can reach.
 *
 * @param attributes - The caller's attributes.
 * @param secrets - Literal values to strip.
 * @returns A redacted copy.
 */
function redactAttributes(attributes: LogAttributes, secrets: readonly string[]): LogAttributes {
  const output: LogAttributes = {};

  for (const [key, value] of Object.entries(attributes)) {
    output[key] = typeof value === "string" ? redactSecrets(value, secrets) : value;
  }

  return output;
}

/**
 * Writes one log line to both sinks.
 *
 * @param level - Severity, which selects both the `console` method and the `Sentry.logger` method.
 * @param message - A fixed, human-readable summary. Fixed on purpose: the variable parts belong in `attributes`, where
 *   they can be filtered on, rather than interpolated into a message that then groups as a thousand distinct strings.
 * @param details - Attributes, cause, and secrets.
 */
function emit(level: "warn" | "error", message: string, details: LogDetails): void {
  const secrets: readonly string[] = details.secrets ?? [];
  const safeMessage: string = redactSecrets(message, secrets);
  const attributes: LogAttributes = redactAttributes(details.attributes ?? {}, secrets);

  const cause: string | undefined = describeCause(details.cause, secrets);
  if (cause !== undefined) attributes.cause = cause;

  // Human-readable, and the only sink that exists when Sentry is switched off — which is the normal state of a local
  // checkout and of the static demo, so it is the one that must not be conditional on anything.
  console[level](`${LOG_PREFIX} ${safeMessage}`, attributes);

  // Machine-queryable, and correlated to the trace that produced it. Guarded because it is the half of this function
  // that calls into someone else's code: this runs inside `catch` blocks whose entire purpose is to keep a degraded
  // page rendering, and a logger that throws there would convert a handled upstream failure into a crash.
  try {
    Sentry.logger[level](safeMessage, attributes);
  } catch {
    // Deliberately empty. The console line above already carried the message, so there is nothing left to salvage and
    // nowhere to report a reporting failure to.
  }
}

/**
 * Records something that went wrong and was handled.
 *
 * The level for everything on the "the app is behaving as designed under bad conditions" side of the line: Congress.gov
 * returned a 503, a request timed out, a search sweep came back short. Individually unremarkable and worth counting; a
 * page still rendered.
 *
 * @param message - A fixed summary. @see emit
 * @param details - Attributes, cause, and secrets.
 */
export function logWarning(message: string, details: LogDetails = {}): void {
  emit("warn", message, details);
}

/**
 * Records something that should not happen and needs someone to look.
 *
 * Reserved for failures that indicate a defect rather than weather — an upstream payload that no longer matches the
 * schema this app validates against, which means either Congress.gov changed its contract or this app read it wrong,
 * and in both cases some part of a page is silently empty until someone changes code.
 *
 * @param message - A fixed summary. @see emit
 * @param details - Attributes, cause, and secrets.
 */
export function logError(message: string, details: LogDetails = {}): void {
  emit("error", message, details);
}
