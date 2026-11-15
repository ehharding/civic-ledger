import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { PAGE_ROUTES, type TestFixtures } from "./routes";

/**
 * An axe sweep of every route shape, enforcing the accessibility baseline in `docs/architecture.md` — the
 * machine-checkable half of WCAG, including contrast, which jsdom can't see. Whether names are useful or focus order
 * makes sense stays with `navigation.spec.ts` and review.
 *
 * Both color schemes are swept, since `tokens.css` carries a full dark palette.
 */

/**
 * The standard swept for: WCAG 2.1 A and AA.
 *
 * AA rather than AAA because AA is what the accessibility baseline's specific commitments amount to and what an
 * AAA-level contrast requirement would have this project relitigate its whole palette against. Stated here as one
 * constant so a route cannot be swept at a quieter standard than its neighbors.
 */
const WCAG_TAGS: readonly string[] = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Axe's own result shapes, read back off the builder rather than imported from `axe-core`.
 *
 * `axe-core` is a transitive dependency of `@axe-core/playwright` — it is the rules engine behind it — and importing
 * its types directly would mean declaring it a second time in `package.json` to keep pnpm's strict resolution honest.
 * Deriving them keeps this file's dependency footprint at the one package it actually calls, and keeps the two versions
 * from being able to disagree.
 */
type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;
type AxeViolation = AxeResults["violations"][number];

/**
 * Runs the sweep and reports violations as one readable summary rather than axe's raw JSON.
 *
 * @param page - The page to scan, already navigated.
 * @param testInfo - The running test, used to attach the full results.
 * @returns Nothing; asserts.
 */
async function expectNoViolations(page: Page, testInfo: TestInfo): Promise<void> {
  // Waited for rather than asserted at the end of each test, because it is the scan's precondition rather than one of
  // its findings. A record page reached by clicking a card is a soft navigation: the URL changes first and the title
  // arrives with the streamed metadata, so a scan fired the moment the URL matched would report `document-title` — a
  // real rule, failing on a page that does declare metadata, purely because it was read too early. Every route's title
  // carries the site name (see metadata.ts), which makes this one condition for all of them.
  await expect(page).toHaveTitle(/Civic Ledger/);

  const results: AxeResults = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();

  await testInfo.attach("axe-results", {
    body: JSON.stringify(results.violations, null, 2),
    contentType: "application/json",
  });

  const summary: string[] = results.violations.map(
    (violation: AxeViolation): string =>
      `${violation.id} (${violation.impact ?? "unknown"}): ${violation.help} — ${violation.nodes
        .map((node: AxeViolation["nodes"][number]): string => node.target.join(" "))
        .join(", ")}`,
  );

  expect(summary, `Accessibility violations on ${page.url()}`).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accessibility (${scheme})`, (): void => {
    test.use({ colorScheme: scheme });

    for (const route of PAGE_ROUTES) {
      test(`${route.name} has no WCAG 2.1 AA violations`, async ({
        page,
      }: TestFixtures, testInfo: TestInfo): Promise<void> => {
        await page.goto(route.path);
        await expectNoViolations(page, testInfo);
      });
    }

    /*
     * The one page state that only exists at a phone's width: the navigation drawer, open. It is swept rather than
     * assumed because it is the app's only overlay — a control whose expanded state, whose scrim, and whose panel are
     * all things axe has rules about, sitting over a page that is still in the tree behind it.
     */
    test("the open navigation drawer has no WCAG 2.1 AA violations", async ({
      page,
    }: TestFixtures, testInfo: TestInfo): Promise<void> => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await page.getByRole("button", { name: "Menu" }).click();

      // Waited on the *opacity* rather than on visibility, and the distinction matters here more than anywhere else in
      // this file. The destinations fade in behind the panel on a stagger, and Playwright calls an element visible as
      // soon as it has a box — opacity is not part of that judgment. Axe's is: a link still at 0.4 through its fade is
      // a real contrast failure at the instant it is measured, so scanning on `toBeVisible` reports the animation
      // rather than the palette. The last destination is the one the stagger finishes on.
      await expect(
        page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Methodology" }),
      ).toHaveCSS("opacity", "1");

      await expectNoViolations(page, testInfo);
    });

    test("a bill record has no WCAG 2.1 AA violations", async ({
      page,
    }: TestFixtures, testInfo: TestInfo): Promise<void> => {
      await page.goto("/bills");
      await page.locator(".bill-card h3 a").first().click();
      await expect(page).toHaveURL(/\/bills\/\d+\/[a-z]+\/\d+$/);

      await expectNoViolations(page, testInfo);
    });

    test("a member record has no WCAG 2.1 AA violations", async ({
      page,
    }: TestFixtures, testInfo: TestInfo): Promise<void> => {
      await page.goto("/members");
      await page.locator(".member-card h3 a").first().click();
      await expect(page).toHaveURL(/\/members\/[A-Za-z0-9-]+$/);

      await expectNoViolations(page, testInfo);
    });

    test("a committee record has no WCAG 2.1 AA violations", async ({
      page,
    }: TestFixtures, testInfo: TestInfo): Promise<void> => {
      await page.goto("/committees");
      await page.locator(".committee-card h3 a").first().click();
      await expect(page).toHaveURL(/\/committees\/(house|senate|joint)\/[a-z0-9-]+$/);

      await expectNoViolations(page, testInfo);
    });
  });
}
