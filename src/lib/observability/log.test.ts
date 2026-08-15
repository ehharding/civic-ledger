/**
 * Covers the app's console boundary.
 *
 * Two properties carry this file. The first is that a log line is *redacted* — this module exists because `redact.ts`
 * was wired into Sentry's callbacks and nothing else, which left `console` as the one path out of this process with no
 * scrubbing on it, on a host where a function log is a third-party sink like any other. The second is that logging
 * *cannot throw*: every caller is a `catch` block whose whole purpose is to keep a degraded page rendering, so a
 * reporting failure that took the request with it would be strictly worse than no reporting at all.
 *
 * @see redact.test.ts for the scrubbing itself, and sentry-options.test.ts for the `beforeSendLog` backstop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The SDK is replaced rather than initialized, for the same reason the error-boundary suites replace it: the subject is
 * what this module hands over, not what Sentry then does with it. Held in a mutable pair so a single test can make the
 * forward throw, which is the failure the guard in `emit` exists for and is otherwise unreachable.
 */
const sentryWarn = vi.fn();
const sentryError = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  logger: {
    warn: (message: string, attributes?: unknown): void => sentryWarn(message, attributes),
    error: (message: string, attributes?: unknown): void => sentryError(message, attributes),
  },
}));

import { describeCause, logError, logWarning } from "@/lib/observability/log";

/** Stands in for a real Congress.gov key, in the same spelling `redact.test.ts` and `error.test.tsx` use. */
const KEY: string = "SUPER-SECRET-KEY";

beforeEach((): void => {
  sentryWarn.mockClear();
  sentryError.mockClear();
  vi.spyOn(console, "warn").mockImplementation((): void => {});
  vi.spyOn(console, "error").mockImplementation((): void => {});
});

afterEach((): void => {
  vi.restoreAllMocks();
});

describe("describeCause", (): void => {
  it("has nothing to say about a thrown nothing", (): void => {
    // Both spellings, because `catch` binds either and a logger that returned "undefined" as a *string* would put the
    // word into an attribute where an operator would read it as a value.
    expect(describeCause(undefined)).toBeUndefined();
    expect(describeCause(null)).toBeUndefined();
  });

  it("renders an error as its name and message", (): void => {
    expect(describeCause(new Error("Congress.gov responded with 503"))).toBe("Error: Congress.gov responded with 503");
  });

  it("follows the cause chain, which is where Node's fetch keeps the actual diagnosis", (): void => {
    // The case this exists for. `TypeError: fetch failed` on its own reports that something failed and nothing about
    // what — the DNS answer is one level down, and a logger that prints only the top of the chain is not worth reading.
    const cause: Error = new TypeError("fetch failed", {
      cause: new Error("getaddrinfo ENOTFOUND api.congress.gov"),
    });

    expect(describeCause(cause)).toBe("TypeError: fetch failed <- Error: getaddrinfo ENOTFOUND api.congress.gov");
  });

  it("stops after three links, so a deeply wrapped error cannot run away with the line", (): void => {
    const deep: Error = new Error("first", {
      cause: new Error("second", { cause: new Error("third", { cause: new Error("fourth") }) }),
    });

    const described: string = describeCause(deep) ?? "";

    expect(described).toBe("Error: first <- Error: second <- Error: third");
    expect(described).not.toContain("fourth");
  });

  it("stops at a chain that ends in an explicit null rather than treating it as a link", (): void => {
    expect(describeCause(new Error("terminal", { cause: null }))).toBe("Error: terminal");
  });

  it("stringifies a thrown value that is not an error at all", (): void => {
    // `throw "string"` and `Promise.reject({ status: 500 })` are both legal and both reach this.
    expect(describeCause("a bare string")).toBe("a bare string");
    expect(describeCause(42)).toBe("42");
  });

  it("survives a thrown value whose own toString throws", (): void => {
    // A half-initialized object can do this, and a logger is the last place in a request that should be the thing that
    // fails. The placeholder is a worse log line than the real one and an infinitely better outcome than a crash.
    const hostile = {
      toString: (): string => {
        throw new Error("nope");
      },
    };

    expect(describeCause(hostile)).toBe("[unserializable]");
  });

  it("strips a credential out of the description, in both of the shapes one arrives in", (): void => {
    // The pattern pass covers the key still attached to its parameter name, which is how it reaches an exception
    // message. The literal pass covers the bare value, which is how it reaches a captured local. @see redactSecrets.
    const described: string =
      describeCause(new Error(`Request failed: https://api.congress.gov/v3/bill/119?api_key=${KEY}`), [KEY]) ?? "";

    expect(described).toContain("api_key=[redacted]");
    expect(described).not.toContain(KEY);
  });

  it("truncates a description long enough to bury the line it is on", (): void => {
    const described: string = describeCause(new Error("x".repeat(500))) ?? "";

    expect(described.endsWith("…")).toBe(true);
    expect(described.length).toBeLessThan(320);
  });
});

describe("logWarning", (): void => {
  it("writes one console line under the app's prefix, with the variable parts as attributes", (): void => {
    // The message is fixed and the specifics are fields, on purpose: an interpolated message groups as a thousand
    // distinct strings, and a field can be filtered on.
    logWarning("Congress.gov request failed", {
      attributes: { event: "congress.request-failed", reason: "http-status", status: 503 },
    });

    expect(console.warn).toHaveBeenCalledWith("[civic-ledger] Congress.gov request failed", {
      event: "congress.request-failed",
      reason: "http-status",
      status: 503,
    });
  });

  it("forwards the same message to Sentry, without the console prefix", (): void => {
    // The prefix is there to pick this app's lines out of a stream it shares with Next, React, and the SDK itself. A
    // Sentry project is already scoped to this app, so carrying it there would only put it in front of every message.
    logWarning("Congress.gov request failed", { attributes: { reason: "transport" } });

    expect(sentryWarn).toHaveBeenCalledWith("Congress.gov request failed", { reason: "transport" });
    expect(sentryError).not.toHaveBeenCalled();
  });

  it("carries no cause attribute when there was no cause", (): void => {
    logWarning("Nothing threw");

    expect(console.warn).toHaveBeenCalledWith("[civic-ledger] Nothing threw", {});
  });

  it("attaches a described cause when there was one", (): void => {
    logWarning("Congress.gov request failed", { cause: new Error("network down") });

    expect(console.warn).toHaveBeenCalledWith("[civic-ledger] Congress.gov request failed", {
      cause: "Error: network down",
    });
  });
});

describe("logError", (): void => {
  it("writes to console.error, which is the level reserved for something needing a code change", (): void => {
    logError("Congress.gov returned an unrecognized payload shape", {
      attributes: { reason: "schema-mismatch", paths: "bills.0.latestAction" },
    });

    expect(console.error).toHaveBeenCalledWith("[civic-ledger] Congress.gov returned an unrecognized payload shape", {
      reason: "schema-mismatch",
      paths: "bills.0.latestAction",
    });
    expect(sentryError).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe("redaction across a whole line", (): void => {
  it("scrubs the message, the cause, and every string attribute, and leaves other scalars alone", (): void => {
    // The point of doing this here rather than relying on `beforeSendLog`: that hook only covers the copy bound for
    // Sentry. This pass is the one that covers the console copy, which no SDK callback can reach.
    logError(`Failed while calling https://api.congress.gov/v3?api_key=${KEY}`, {
      attributes: { detail: `key was ${KEY}`, status: 500, retried: false },
      cause: new Error(`upstream said api_key=${KEY} is invalid`),
      secrets: [KEY],
    });

    const [message, attributes] = vi.mocked(console.error).mock.calls[0] as [
      string,
      { detail: string; cause: string; status: number; retried: boolean },
    ];

    expect(message).not.toContain(KEY);
    expect(attributes.detail).toBe("key was [redacted]");
    expect(attributes.cause).not.toContain(KEY);

    // Non-strings pass through untouched — an attribute is a thing to filter on, and a redactor that stringified a
    // status code would break every query written against it.
    expect(attributes.status).toBe(500);
    expect(attributes.retried).toBe(false);
  });
});

describe("the guarantee that logging cannot make things worse", (): void => {
  it("still writes the console line when the Sentry forward throws", (): void => {
    // Reachable in production whenever the SDK is present but not initialized the way this module expects — and every
    // caller is a `catch` block holding a page together, so this must degrade to "one sink instead of two" rather than
    // to an exception thrown from inside the error path.
    sentryError.mockImplementation((): never => {
      throw new Error("Sentry is not initialized");
    });

    expect((): void => logError("Something failed")).not.toThrow();
    expect(console.error).toHaveBeenCalledWith("[civic-ledger] Something failed", {});
  });
});
