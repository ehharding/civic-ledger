/**
 * Covers `robots.txt` generation.
 *
 * Two things are worth pinning here, and neither is the file's shape: that the sitemap pointer is an absolute URL built
 * from the same resolver the canonical tags use (a relative one is silently ignored by every crawler), and that `/api/`
 * stays disallowed for the reason the route's own comment gives — those endpoints are this app's internal proxies, and
 * indexing them would surface bare JSON in place of the pages that make it mean something. The query-variant rules are
 * pinned for the same kind of reason: they are what keeps a crawler from paying for an on-demand render per facet.
 */
import type { MetadataRoute } from "next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import robots from "@/app/robots";
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
  it("allows the whole site to every crawler", (): void => {
    const { rules }: MetadataRoute.Robots = robots();

    expect(rules).toEqual([
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/query/", "/bills?", "/bills/*?", "/members?", "/committees?", "/committees/*/*?"],
      },
    ]);
  });

  it("disallows /api/, since those routes are internal proxies rather than pages", (): void => {
    const rules = robots().rules;
    const [rule] = Array.isArray(rules) ? rules : [rules];

    expect(rule?.disallow).toContain("/api/");
  });

  it("keeps crawlers off the on-demand query variants, which are duplicates of a page it may crawl", (): void => {
    const rules = robots().rules;
    const [rule] = Array.isArray(rules) ? rules : [rules];

    // The plain routes stay crawlable; only their query-carrying form and the twins a rewrite serves it from do not.
    expect(rule?.disallow).toEqual(expect.arrayContaining(["/query/", "/members?", "/committees/*/*?"]));
    expect(rule?.disallow).not.toContain("/members");
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
