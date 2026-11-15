/**
 * Covers `robots.txt`: the sitemap pointer is absolute and built from the canonical resolver (crawlers ignore relative
 * ones), `/api/` stays disallowed, and the query-variant rules keep crawlers off on-demand renders.
 */
import type { MetadataRoute } from "next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import robots, { AI_TRAINING_CRAWLERS, billRecordRules } from "@/app/robots";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { getSiteUrl } from "@/lib/site";

const originalSiteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach((): void => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://civic-ledger.test";
});

afterEach((): void => {
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

describe("robots", (): void => {
  it("denies AI training crawlers the whole site and allows everyone else", (): void => {
    const { rules }: MetadataRoute.Robots = robots();

    expect(rules).toEqual([
      { userAgent: [...AI_TRAINING_CRAWLERS], disallow: "/" },
      {
        userAgent: "*",
        allow: ["/", `/bills/${getCurrentCongress()}/`, `/bills/${getCurrentCongress() + 1}/`],
        disallow: [
          "/api/",
          "/query/",
          "/bills?",
          "/bills/*?",
          "/members?",
          "/committees?",
          "/committees/*/*?",
          "/bills/*/",
        ],
      },
    ]);
  });

  it("disallows /api/, since those routes are internal proxies rather than pages", (): void => {
    const rules = robots().rules;
    const rule = (Array.isArray(rules) ? rules : [rules]).find((r) => r.userAgent === "*");

    expect(rule?.disallow).toContain("/api/");
  });

  it("keeps crawlers off the on-demand query variants, which are duplicates of a page it may crawl", (): void => {
    const rules = robots().rules;
    const rule = (Array.isArray(rules) ? rules : [rules]).find((r) => r.userAgent === "*");

    // The plain routes stay crawlable; only their query-carrying form and the twins a rewrite serves it from do not.
    expect(rule?.disallow).toEqual(expect.arrayContaining(["/query/", "/members?", "/committees/*/*?"]));
    expect(rule?.disallow).not.toContain("/members");
  });

  it("names GPTBot, the crawler that was ~98% of all traffic, and leaves search and user-fetch agents alone", (): void => {
    // Blocking a search agent would cost readers; blocking a training crawler costs nothing but model-training reach.
    expect(AI_TRAINING_CRAWLERS).toContain("GPTBot");
    for (const agent of ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Googlebot", "Bingbot"]) {
      expect(AI_TRAINING_CRAWLERS).not.toContain(agent);
    }
  });

  it("points at an absolute sitemap URL, which is the only form a crawler honors", (): void => {
    const { sitemap }: MetadataRoute.Robots = robots();

    expect(sitemap).toBe("https://civic-ledger.test/sitemap.xml");
    expect(new URL(sitemap as string).protocol).toBe("https:");
  });

  it("builds that URL from the shared site resolver rather than a literal of its own", (): void => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://elsewhere.test";

    expect(robots().sitemap).toBe(`${getSiteUrl()}/sitemap.xml`);
  });

  /*
   * Robots matching is longest-path-wins, so these assertions apply that rule to sample paths rather than only
   * restating the arrays: what matters is which URLs a crawler may fetch.
   */
  describe("bill records", (): void => {
    /**
     * Resolves a path against allow and disallow prefixes the way Google and Bing do: the longest matching rule wins,
     * and `*` matches any run of characters.
     */
    function isAllowed(path: string, rules: { allow: string[]; disallow: string[] }): boolean {
      const matchLength = (patterns: string[]): number =>
        Math.max(
          -1,
          ...patterns
            .filter((pattern: string): boolean =>
              new RegExp(`^${pattern.replace(/[.?+()]/g, "\\$&").replace(/\*/g, ".*")}`).test(path),
            )
            .map((pattern: string): number => pattern.length),
        );
      return matchLength(rules.allow) >= matchLength(rules.disallow);
    }

    const rules = { allow: ["/", ...billRecordRules(119).allow], disallow: billRecordRules(119).disallow };

    it("keeps crawlers off a concluded Congress's bill pages", (): void => {
      expect(isAllowed("/bills/100/hr/1005", rules)).toBe(false);
      expect(isAllowed("/bills/118/s/42", rules)).toBe(false);
    });

    it("leaves the sitting Congress's bill pages, and the next one's, crawlable", (): void => {
      expect(isAllowed("/bills/119/hr/10357", rules)).toBe(true);
      expect(isAllowed("/bills/120/hr/1", rules)).toBe(true);
    });

    it("leaves every Congress's directory crawlable, so readers can still find concluded bills by search", (): void => {
      expect(isAllowed("/bills/100", rules)).toBe(true);
      expect(isAllowed("/bills", rules)).toBe(true);
    });
  });
});
