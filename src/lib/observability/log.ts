import * as Sentry from "@sentry/nextjs";

import { redactSecrets } from "@/lib/observability/redact";

/**
 * The one way this app writes a log line, in every runtime.
 *
 * Upstream failures never throw (`requestCongressJson` turns them into `{ outcome: "failed" }`), so they never reach an
 * error boundary or `onRequestError`; this log is their only report. Each line is redacted here and sent to both
 * `console` and Sentry's structured logs, since a function log is a third-party sink like any other
 * (`docs/data-policy.md`).
 *
 * **Logs, not exceptions.** An outage fails dozens of parallel search requests a minute; filing each as an issue would
 * bury real ones and exhaust the quota. Genuine crashes still reach `captureException` from the error boundaries.
 *
 * @see sentry-options.ts, which turns logs on and puts `beforeSendLog` in front of them.
 */

/**
 * The prefix on every console line this module writes, marking lines this app wrote on purpose in a stream shared with
 * Next, React, and Sentry. What a line is *about* goes in the filterable `event` attribute.
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
  /**
   * The caught value, when there is one. Described rather than logged whole.
   *
   * @see describeCause
   */
  cause?: unknown;
  /**
   * Literal values that must never appear in the line, forwarded to {@link redactSecrets}. Passed by the caller, since
   * reading the key here would pull the upstream adapter into client bundles and create an import cycle with `http.ts`.
   */
  secrets?: readonly string[];
};

/**
 * Renders a caught value as one short, redacted line.
 *
 * @param cause - Anything a `catch` can bind, which is genuinely anything.
 * @param secrets - Literal values to strip, forwarded to {@link redactSecrets}.
 * @returns A single line capped at {@link MAX_CAUSE_LENGTH}, or `undefined` when there's nothing to describe. `Error`s
 *   render as `Name: message` following the `cause` chain (where `fetch` keeps the useful half); anything else is
 *   stringified defensively, since even `toString` can throw.
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
 * The `digest` Next attaches to an error forwarded from a Server Component, which correlates a boundary's log line with
 * the server's line for the same failure.
 *
 * Narrowed rather than read, because an error boundary receives whatever was thrown: a Client Component can throw a
 * value that is not an `Error` at all, and Next forwards it as-is.
 *
 * @param error - The value an error boundary caught.
 * @returns The digest when the value carries a string one, otherwise `"none"`, so the attribute is always present and a
 *   query for boundaries with no server-side twin is a plain equality filter.
 */
export function errorDigest(error: unknown): string {
  if (typeof error !== "object" || error === null || !("digest" in error)) return "none";
  return typeof error.digest === "string" ? error.digest : "none";
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
  if (cause !== undefined) attributes["cause"] = cause;

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
 * Records something that went wrong and was handled — a 503, a timeout, a short search sweep. A page still rendered.
 *
 * @param message - A fixed summary.
 * @param details - Attributes, cause, and secrets.
 * @see emit
 */
export function logWarning(message: string, details: LogDetails = {}): void {
  emit("warn", message, details);
}

/**
 * Records a defect rather than weather — e.g., a payload that fails schema validation, meaning Congress.gov changed its
 * contract or this app reads it wrong, and part of a page stays empty until code changes.
 *
 * @param message - A fixed summary.
 * @param details - Attributes, cause, and secrets.
 * @see emit
 */
export function logError(message: string, details: LogDetails = {}): void {
  emit("error", message, details);
}
