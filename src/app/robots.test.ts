/**
 * Covers `robots.txt`: the sitemap pointer is absolute and built from the canonical resolver (crawlers ignore relative
 * ones), `/api/` stays disallowed, and the query-variant rules keep crawlers off on-demand renders.
 */
import type { MetadataRoute } from "next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import robots, { AI_TRAINING_CRAWLERS } from "@/app/robots";
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
        allow: "/",
        disallow: ["/api/", "/query/", "/bills?", "/bills/*?", "/members?", "/committees?", "/committees/*/*?"],
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
});
