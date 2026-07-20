import type {
  Locator,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
} from "@playwright/test";
import { expect, test } from "@playwright/test";

// Smoke coverage for the primary navigation shell. `playwright.config.ts` points `testDir` at this directory — keep at
// least one spec here so the CI "browser" job has something to run.

test("home page renders the hero and primary nav", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "See Congress in Context." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Civic Ledger Home" })).toBeVisible();

  const primaryNav: Locator = page.getByRole("navigation", { name: "Primary Navigation" });
  await expect(primaryNav.getByRole("link", { name: "Bills" })).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Learn" })).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Methodology" })).toBeVisible();
});

test("primary nav links land on the right page", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  await page.goto("/");
  const primaryNav: Locator = page.getByRole("navigation", { name: "Primary Navigation" });

  await primaryNav.getByRole("link", { name: "Bills" }).click();
  await expect(page).toHaveURL(/\/bills$/);
  await expect(page.getByRole("heading", { level: 1, name: "Start With the Record." })).toBeVisible();
  await expect(page).toHaveTitle("Bills — Civic Ledger");

  await primaryNav.getByRole("link", { name: "Learn" }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(page.getByRole("heading", { level: 1, name: "Learn the Language As You Go." })).toBeVisible();

  await primaryNav.getByRole("link", { name: "Methodology" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page).toHaveTitle("About — Civic Ledger");
});

test("header search submits the query to the bills directory", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  await page.goto("/");

  await page.getByRole("searchbox", { name: "Search Bills" }).fill("infrastructure");
  await page.getByRole("searchbox", { name: "Search Bills" }).press("Enter");

  await expect(page).toHaveURL(/\/bills\?q=infrastructure/);
});
