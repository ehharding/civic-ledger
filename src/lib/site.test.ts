/**
 * Covers the canonical-site-URL resolution that `metadataBase`, `sitemap.ts`, and `robots.ts` all build on.
 *
 * The precedence order is the whole point of the function, so each case is pinned with the *higher*-priority variables
 * also set — a test that only ever sets one variable at a time would pass just as happily against a function that
 * checked them in any order at all.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSiteUrl } from "@/lib/site";

/** The three variables this function reads, cleared before each case so only the ones a test sets are present. */
const SITE_URL_VARS: readonly string[] = ["NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"];

beforeEach((): void => {
  for (const name of SITE_URL_VARS) vi.stubEnv(name, undefined);
});

describe("getSiteUrl", (): void => {
  it("prefers an explicit NEXT_PUBLIC_SITE_URL over every Vercel-injected variable", (): void => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://civic-ledger.org");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "project.vercel.app");
    vi.stubEnv("VERCEL_URL", "deployment.vercel.app");

    expect(getSiteUrl()).toBe("https://civic-ledger.org");
  });

  it("falls back to Vercel's production URL, adding the scheme Vercel omits", (): void => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "project.vercel.app");
    vi.stubEnv("VERCEL_URL", "deployment.vercel.app");

    expect(getSiteUrl()).toBe("https://project.vercel.app");
  });

  it("falls back to the per-deployment URL when no production URL is set", (): void => {
    vi.stubEnv("VERCEL_URL", "deployment.vercel.app");

    expect(getSiteUrl()).toBe("https://deployment.vercel.app");
  });

  it("falls back to a reserved placeholder domain, so a local build never claims a real one", (): void => {
    // `.example` is reserved by RFC 2606 and can never be registered, which is the property that matters: a canonical
    // URL emitted by an unconfigured build points somewhere that provably belongs to nobody.
    expect(getSiteUrl()).toBe("https://civic-ledger.example");
    expect(new URL(getSiteUrl()).hostname.endsWith(".example")).toBe(true);
  });

  it("treats an empty NEXT_PUBLIC_SITE_URL as unset rather than as a valid origin", (): void => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_URL", "deployment.vercel.app");

    expect(getSiteUrl()).toBe("https://deployment.vercel.app");
  });

  it("drops a trailing slash, which is what copying a site root out of an address bar gives you", (): void => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://civic-ledger.org/");

    expect(getSiteUrl()).toBe("https://civic-ledger.org");
  });

  it("drops a trailing slash from either Vercel-injected variable too", (): void => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "project.vercel.app/");
    expect(getSiteUrl()).toBe("https://project.vercel.app");

    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined);
    vi.stubEnv("VERCEL_URL", "deployment.vercel.app/");
    expect(getSiteUrl()).toBe("https://deployment.vercel.app");
  });

  it("leaves the concatenating callers a base they can append a rooted path to", (): void => {
    // The actual failure this guards. `robots.ts` and `sitemap.ts` both build URLs by concatenation, so a base with a
    // trailing slash silently emits `//sitemap.xml` — a path a crawler reads as distinct from the one served.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://civic-ledger.org///");

    expect(`${getSiteUrl()}/sitemap.xml`).toBe("https://civic-ledger.org/sitemap.xml");
  });
});
