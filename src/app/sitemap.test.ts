/**
 * Covers `sitemap.xml` generation.
 *
 * The interesting assertions are all about what the file *refuses* to do. Its own comment commits to being cheap and
 * reliable — no API key, no upstream request, no unbounded enumeration — and the way that commitment breaks is by
 * someone helpfully adding individual bill or member pages to it. So the tests pin both halves: every route that should
 * be listed is, and the per-record pages that shouldn't be listed aren't.
 */
import type { MetadataRoute } from "next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import { listCongresses } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import { lessons } from "@/lib/lessons";
import { lessonHref } from "@/lib/routes";

const SITE_URL: string = "https://civic-ledger.test";
const originalSiteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach((): void => {
  process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;
});

afterEach((): void => {
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

/** Every URL the sitemap advertises, which is what most of these assertions are really about. */
function urls(): string[] {
  return sitemap().map((entry: MetadataRoute.Sitemap[number]): string => entry.url);
}

/** One entry, looked up by the path beneath the site URL. */
function entryFor(path: string): MetadataRoute.Sitemap[number] | undefined {
  return sitemap().find((entry: MetadataRoute.Sitemap[number]): boolean => entry.url === `${SITE_URL}${path}`);
}

describe("sitemap", (): void => {
  it("lists every static top-level route", (): void => {
    expect(urls()).toEqual(
      expect.arrayContaining(
        ["", "/bills", "/members", "/committees", "/learn", "/about"].map(
          (route: string): string => `${SITE_URL}${route}`,
        ),
      ),
    );
  });

  it("lists every lesson, read out of the registry rather than restated here", (): void => {
    for (const lesson of lessons) {
      expect(urls(), lesson.slug).toContain(`${SITE_URL}${lessonHref(lesson.slug)}`);
    }
  });

  it("lists one bill-directory page per supported Congress", (): void => {
    const congressUrls: string[] = listCongresses().map(
      (entry: { number: number }): string => `${SITE_URL}/bills/${entry.number}`,
    );

    expect(urls()).toEqual(expect.arrayContaining(congressUrls));
    expect(sitemap()).toHaveLength(6 + lessons.length + congressUrls.length);
  });

  it("gives the home page top priority and a daily change frequency", (): void => {
    const home: MetadataRoute.Sitemap[number] | undefined = entryFor("");

    expect(home?.priority).toBe(1);
    expect(home?.changeFrequency).toBe("daily");
  });

  it("marks /bills as daily and the other static routes as monthly", (): void => {
    expect(entryFor("/bills")?.changeFrequency).toBe("daily");
    expect(entryFor("/about")?.changeFrequency).toBe("monthly");
    expect(entryFor("/about")?.priority).toBe(0.8);
  });

  it("ranks the current Congress above the concluded ones, which are final and change yearly at most", (): void => {
    const current: MetadataRoute.Sitemap[number] | undefined = entryFor(`/bills/${getCurrentCongress()}`);
    const concluded: MetadataRoute.Sitemap[number] | undefined = entryFor(`/bills/${getCurrentCongress() - 1}`);

    expect(current?.changeFrequency).toBe("daily");
    expect(current?.priority).toBe(0.9);
    expect(concluded?.changeFrequency).toBe("yearly");
    expect(concluded?.priority).toBe(0.5);
  });

  it("stamps every entry with a last-modified date", (): void => {
    for (const entry of sitemap()) {
      expect(entry.lastModified, entry.url).toBeInstanceOf(Date);
    }
  });

  it("never enumerates an individual bill, member, or committee record", (): void => {
    // The refusal this file's comment is built around: enumerating those requires a live Congress.gov request, which
    // would make sitemap generation depend on an API key and a healthy upstream at build time. Each directory page is
    // what leads a crawler to them instead.
    for (const url of urls()) {
      const path: string = new URL(url).pathname;

      expect(path, url).not.toMatch(/^\/members\/.+/);
      expect(path, url).not.toMatch(/^\/committees\/.+/);
      // `/bills/119` is a directory; `/bills/119/hr/284` is a record.
      expect(path.split("/").filter(Boolean).length, url).toBeLessThanOrEqual(2);
    }
  });

  it("emits absolute, unique, https URLs", (): void => {
    const all: string[] = urls();

    expect(new Set(all).size).toBe(all.length);
    for (const url of all) {
      // Compare parsed origins rather than a string prefix. `https://civic-ledger.test.evil.example/` starts with
      // `SITE_URL` but is a different host, so a prefix check would call a hijacked URL absolute and on-site; origin
      // equality pins scheme, host, and port at once, which is exactly what "absolute and ours" means.
      expect(new URL(url).origin, url).toBe(SITE_URL);
    }
  });
});
