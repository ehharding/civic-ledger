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
  await expect(page.getByRole("link", { name: "Civic Ledger home" })).toBeVisible();

  const primaryNav: Locator = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(primaryNav.getByRole("link", { name: "Bills" })).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Learn" })).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Methodology" })).toBeVisible();
});

test("primary nav links land on the right page", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  await page.goto("/");
  const primaryNav: Locator = page.getByRole("navigation", { name: "Primary navigation" });

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

  await page.getByRole("searchbox", { name: "Search bills" }).fill("infrastructure");
  await page.getByRole("searchbox", { name: "Search bills" }).press("Enter");

  await expect(page).toHaveURL(/\/bills\?q=infrastructure/);
});

test("opening a bill card leads to a detail page with the official-record link", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  await page.goto("/bills");

  const firstCardLink: Locator = page.locator(".bill-card h3 a").first();
  const billTitle: string | null = await firstCardLink.textContent();
  await firstCardLink.click();

  await expect(page).toHaveURL(/\/bills\/\d+\/[a-z]+\/\d+$/);
  if (billTitle) await expect(page.getByRole("heading", { level: 1, name: billTitle })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the Official Record" })).toBeVisible();

  await page.getByRole("link", { name: "All Bills" }).click();
  await expect(page).toHaveURL(/\/bills$/);
});

test("the bill-lifecycle lesson is reachable from /learn and links onward to /bills", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  await page.goto("/learn");

  await page.getByRole("link", { name: "Start the Lesson" }).click();
  await expect(page).toHaveURL(/\/learn\/how-a-bill-becomes-law$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "The Path From an Introduced Bill to a Public Law." }),
  ).toBeVisible();

  // All five BillJourney stages should appear as lesson step headings, in order.
  for (const label of ["Introduced", "In Committee", "Passed a Chamber", "To the President", "Became Law"]) {
    await expect(page.getByRole("heading", { level: 2, name: label })).toBeVisible();
  }

  await page.getByRole("link", { name: "Explore Bills" }).click();
  await expect(page).toHaveURL(/\/bills$/);
});
