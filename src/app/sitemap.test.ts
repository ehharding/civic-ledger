/**
 * Covers `sitemap.xml` generation.
 *
 * Most of the interesting assertions are still about what the file refuses to do — it commits to being cheap and
 * reliable, with no API key and no upstream request — but one of those refusals has a stated condition now. Individual
 * records were kept out because enumerating them required a live Congress.gov request at build time; reading them from
 * the ingested copy needs neither a key nor a healthy upstream, so they are listed when a store has them and the file
 * is exactly what it was before when it doesn't. Both halves are pinned below.
 */
import type { MetadataRoute } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import sitemap from "@/app/sitemap";
import { listCongresses } from "@/lib/congress/congress-history";
import { getCurrentCongress } from "@/lib/congress/current-congress";
import * as stored from "@/lib/ingest/stored";
import { lessonHref } from "@/lib/lesson-route";
import { lessons } from "@/lib/lessons";

const SITE_URL: string = "https://civic-ledger.test";
const originalSiteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach((): void => {
  vi.restoreAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;
});

afterEach((): void => {
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

/** Stubs the stored-record read, so these tests never depend on whether a database happens to be configured. */
function stubStoredPaths(paths: string[], omitted = 0): void {
  vi.spyOn(stored, "listStoredRecordPaths").mockResolvedValue({ paths, omitted });
}

/** Every URL the sitemap advertises, which is what most of these assertions are really about. */
async function urls(): Promise<string[]> {
  return (await sitemap()).map((entry: MetadataRoute.Sitemap[number]): string => entry.url);
}

/** One entry, looked up by the path beneath the site URL. */
async function entryFor(path: string): Promise<MetadataRoute.Sitemap[number] | undefined> {
  return (await sitemap()).find((entry: MetadataRoute.Sitemap[number]): boolean => entry.url === `${SITE_URL}${path}`);
}

describe("sitemap", (): void => {
  it("lists every static top-level route", async (): Promise<void> => {
    expect(await urls()).toEqual(
      expect.arrayContaining(
        ["", "/bills", "/members", "/committees", "/learn", "/about"].map(
          (route: string): string => `${SITE_URL}${route}`,
        ),
      ),
    );
  });

  it("lists every lesson, read out of the registry rather than restated here", async (): Promise<void> => {
    const all: string[] = await urls();

    for (const lesson of lessons) {
      expect(all, lesson.slug).toContain(`${SITE_URL}${lessonHref(lesson.slug)}`);
    }
  });

  it("lists one bill-directory page per supported Congress", async (): Promise<void> => {
    stubStoredPaths([]);

    const congressUrls: string[] = listCongresses().map(
      (entry: { number: number }): string => `${SITE_URL}/bills/${entry.number}`,
    );

    expect(await urls()).toEqual(expect.arrayContaining(congressUrls));
    expect(await sitemap()).toHaveLength(6 + lessons.length + congressUrls.length);
  });

  it("gives the home page top priority and a daily change frequency", async (): Promise<void> => {
    const home: MetadataRoute.Sitemap[number] | undefined = await entryFor("");

    expect(home?.priority).toBe(1);
    expect(home?.changeFrequency).toBe("daily");
  });

  it("marks /bills as daily and the other static routes as monthly", async (): Promise<void> => {
    expect((await entryFor("/bills"))?.changeFrequency).toBe("daily");
    expect((await entryFor("/about"))?.changeFrequency).toBe("monthly");
    expect((await entryFor("/about"))?.priority).toBe(0.8);
  });

  it("ranks the current Congress above the concluded ones, which are final and change yearly at most", async (): Promise<void> => {
    const current: MetadataRoute.Sitemap[number] | undefined = await entryFor(`/bills/${getCurrentCongress()}`);
    const concluded: MetadataRoute.Sitemap[number] | undefined = await entryFor(`/bills/${getCurrentCongress() - 1}`);

    expect(current?.changeFrequency).toBe("daily");
    expect(current?.priority).toBe(0.9);
    expect(concluded?.changeFrequency).toBe("yearly");
    expect(concluded?.priority).toBe(0.5);
  });

  it("stamps every entry with a last-modified date", async (): Promise<void> => {
    stubStoredPaths(["/bills/119/hr/284"]);

    for (const entry of await sitemap()) {
      expect(entry.lastModified, entry.url).toBeInstanceOf(Date);
    }
  });

  /* The refusal that still holds unconditionally: with nothing ingested — which is every checkout without a database,
     and the static export by construction — the file is exactly the constant-derived list it always was. */
  it("enumerates no individual record when nothing is stored", async (): Promise<void> => {
    stubStoredPaths([]);

    for (const url of await urls()) {
      const path: string = new URL(url).pathname;

      expect(path, url).not.toMatch(/^\/members\/.+/);
      expect(path, url).not.toMatch(/^\/committees\/.+/);
      // `/bills/119` is a directory; `/bills/119/hr/284` is a record.
      expect(path.split("/").filter(Boolean).length, url).toBeLessThanOrEqual(2);
    }
  });

  it("makes no upstream request, with or without records on hand", async (): Promise<void> => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    stubStoredPaths(["/members/L000174"]);

    try {
      await sitemap();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("lists the stored records it is given, as weekly-changing pages", async (): Promise<void> => {
    stubStoredPaths(["/bills/119/hr/284", "/members/L000174", "/committees/house/hsag00"]);

    const record: MetadataRoute.Sitemap[number] | undefined = await entryFor("/bills/119/hr/284");

    expect(await urls()).toEqual(
      expect.arrayContaining([
        `${SITE_URL}/bills/119/hr/284`,
        `${SITE_URL}/members/L000174`,
        `${SITE_URL}/committees/house/hsag00`,
      ]),
    );
    expect(record?.changeFrequency).toBe("weekly");
    expect(record?.priority).toBe(0.6);
  });

  /* A sitemap that silently truncates reads exactly like one that covered everything, so the cap says so out loud. */
  it("warns when the per-type cap dropped records", async (): Promise<void> => {
    const warn = vi.spyOn(console, "warn").mockImplementation((): void => undefined);
    stubStoredPaths(["/bills/119/hr/284"], 12);

    await sitemap();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("12 stored records omitted"));
  });

  it("stays quiet when nothing was dropped", async (): Promise<void> => {
    const warn = vi.spyOn(console, "warn").mockImplementation((): void => undefined);
    stubStoredPaths(["/bills/119/hr/284"]);

    await sitemap();

    expect(warn).not.toHaveBeenCalled();
  });

  it("emits absolute, unique, https URLs", async (): Promise<void> => {
    stubStoredPaths(["/bills/119/hr/284"]);
    const all: string[] = await urls();

    expect(new Set(all).size).toBe(all.length);
    for (const url of all) {
      // Compare parsed origins rather than a string prefix. `https://civic-ledger.test.evil.example/` starts with
      // `SITE_URL` but is a different host, so a prefix check would call a hijacked URL absolute and on-site; origin
      // equality pins scheme, host, and port at once, which is exactly what "absolute and ours" means.
      expect(new URL(url).origin, url).toBe(SITE_URL);
    }
  });
});
