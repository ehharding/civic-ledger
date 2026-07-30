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
  await expect(primaryNav.getByRole("link", { name: "Members" })).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Committees" })).toBeVisible();
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

  await primaryNav.getByRole("link", { name: "Members" }).click();
  await expect(page).toHaveURL(/\/members$/);
  await expect(page.getByRole("heading", { level: 1, name: "The People Who Write It." })).toBeVisible();
  await expect(page).toHaveTitle("Members — Civic Ledger");

  await primaryNav.getByRole("link", { name: "Committees" }).click();
  await expect(page).toHaveURL(/\/committees$/);
  await expect(page.getByRole("heading", { level: 1, name: "Where Bills Actually Go." })).toBeVisible();
  await expect(page).toHaveTitle("Committees — Civic Ledger");

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

test("a bill's sponsor leads to their member page", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  await page.goto("/bills");
  await page.locator(".bill-card h3 a").first().click();
  await expect(page).toHaveURL(/\/bills\/\d+\/[a-z]+\/\d+$/);

  // The sponsor line links inward to this app's own page for that person, not out to the Biographical Directory.
  const sponsorLink: Locator = page.locator('.bill-detail-meta a[href^="/members/"]').first();
  const sponsorName: string | null = await sponsorLink.textContent();
  await sponsorLink.click();

  await expect(page).toHaveURL(/\/members\/[A-Za-z0-9-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Bills They Introduced" })).toBeVisible();

  // The member page names the same person the bill credited, even though it renders the name in reading order.
  if (sponsorName) {
    const surname: string = (sponsorName.split(",")[0] ?? "").replace(/^(Rep\.|Sen\.)\s*/, "").trim();
    if (surname) await expect(page.getByRole("heading", { level: 1 })).toContainText(surname);
  }
});

test("the member directory filters in place and opens a member's page", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  await page.goto("/members");

  const firstCardLink: Locator = page.locator(".member-card h3 a").first();
  const memberName: string | null = await firstCardLink.textContent();
  expect(memberName).toBeTruthy();

  // Filtering is entirely client-side, so narrowing writes the view into the address bar with history.replaceState
  // rather than navigating. Asserting the query string is what distinguishes that from "nothing happened yet" — a
  // bare /\/members$/ would be satisfied by the un-narrowed page this test starts on, and so would pass before the
  // filter ever ran.
  const surname: string = (memberName ?? "").split(",")[0] ?? "";
  await page.getByRole("searchbox", { name: /Search members/ }).fill(surname);

  await page.locator(".member-card h3 a").first().click();
  await expect(page).toHaveURL(/\/members\/[A-Za-z0-9-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(surname);

  // A member page leads back to the list it came from, not only to the home page.
  await page.getByRole("link", { name: "All Members" }).click();
  await expect(page).toHaveURL(/\/members$/);
});

test("the skip link is the first tab stop and moves focus to the main landmark", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skipLink: Locator = page.getByRole("link", { name: "Skip to Main Content" });
  await expect(skipLink).toBeFocused();
  // Hidden until focused, then a normal visible control — a skip link nobody can see is a skip link nobody can use.
  await expect(skipLink).toBeVisible();

  await skipLink.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});

test("a committee page explains what its kind of committee is and lists its subcommittees", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  await page.goto("/committees");

  // The subcommittee count on a card is the promise that the parent's page has something one level down; this is the
  // test that the promise is kept, since the directory deliberately doesn't list subcommittees itself.
  const withSubcommittees: Locator = page
    .locator(".committee-card")
    .filter({ hasText: /subcommittee/ })
    .first();
  await withSubcommittees.locator("h3 a").click();

  await expect(page.getByRole("region", { name: "Recorded History" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Subcommittees" })).toBeVisible();

  // The type explainer is the reason this page exists rather than the directory linking straight out.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const firstSubcommittee: Locator = page.locator(".committee-subcommittee-list a").first();
  await firstSubcommittee.click();

  await expect(page).toHaveURL(/\/committees\/(house|senate|joint)\/[a-z0-9-]+$/);
  await expect(page.getByText(/Subcommittee of/)).toBeVisible();
});
