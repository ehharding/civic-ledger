import AxeBuilder from "@axe-core/playwright";
import type { Page, PlaywrightTestArgs, PlaywrightTestOptions, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

/**
 * The enforcement point for the accessibility baseline in `docs/architecture.md`.
 *
 * That section makes a dozen specific claims — semantic landmarks, labeled controls, real links, contrast-conscious
 * colors, a heading order that skips no level — and a rule with no named enforcement point is a wish. This is the
 * point: an automated sweep of every route shape the app serves, run in CI on the same job the rest of the browser
 * suite is. It is also the only check in the project that reads the page the way a browser paints it, which is what
 * makes it the one that can see a color at all — Vitest renders into jsdom, which has no layout and no computed colors.
 *
 * **What this does and does not buy.** Automated rules catch roughly the machine-checkable half of WCAG: a control with
 * no accessible name, an `aria-labelledby` pointing at nothing, insufficient contrast, a heading level skipped, a
 * landmark nested wrong. They cannot tell whether a name is *useful*, whether focus order makes sense, or whether the
 * chamber diagram's arrow-key model is discoverable. Those stay with `navigation.spec.ts`, which drives the keyboard
 * directly, and with review. This file exists to keep the mechanical half from regressing silently, not to certify the
 * page.
 *
 * **Both color schemes are swept**, because `tokens.css` carries a full second palette behind
 * `prefers-color-scheme: dark` and contrast is a property of the palette in force rather than of the markup. A dark
 * token that fails contrast is invisible to a light-mode run and to a reviewer who does not use dark mode, which is
 * exactly the kind of failure that ships.
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

/** Every route with a shape of its own. The three record pages are reached by their id below, since they have none. */
const STATIC_ROUTES: readonly { path: string; name: string }[] = [
  { path: "/", name: "home" },
  { path: "/bills", name: "bill directory" },
  { path: "/members", name: "member directory" },
  { path: "/committees", name: "committee directory" },
  { path: "/learn", name: "learn hub" },
  { path: "/learn/how-a-bill-becomes-law", name: "lesson" },
  { path: "/about", name: "methodology" },
  // A narrowed directory that matched nothing: a different render of the same route, and the one carrying the empty
  // state's own clear action. @see DirectoryEmptyState.
  { path: "/members?q=zzznomatch", name: "member directory, empty" },
];

/**
 * Runs the sweep and reports every violation as one readable failure.
 *
 * Axe's own result objects are large and nested, so a bare `toEqual([])` prints a wall of JSON that buries which rule
 * broke. The mapped summary is what makes a red CI job diagnosable from the log alone.
 *
 * @param page - The page to scan, already navigated.
 * @param testInfo - The running test, used to attach the full results for a failure worth reading in detail.
 * @returns Nothing; asserts.
 */
async function expectNoViolations(page: Page, testInfo: TestInfo): Promise<void> {
  // Waited for rather than asserted at the end of each test, because it is the scan's precondition rather than one of
  // its findings. A record page reached by clicking a card is a soft navigation: the URL changes first and the title
  // arrives with the streamed metadata, so a scan fired the moment the URL matched would report `document-title` — a
  // real rule, failing on a page that does declare metadata, purely because it was read too early. Every route's title
  // carries the site name (@see metadata.ts), which makes this one condition for all of them.
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

    for (const route of STATIC_ROUTES) {
      test(`${route.name} has no WCAG 2.1 AA violations`, async ({
        page,
      }: PlaywrightTestArgs & PlaywrightTestOptions, testInfo: TestInfo): Promise<void> => {
        await page.goto(route.path);
        await expectNoViolations(page, testInfo);
      });
    }

    test("a bill record has no WCAG 2.1 AA violations", async ({
      page,
    }: PlaywrightTestArgs & PlaywrightTestOptions, testInfo: TestInfo): Promise<void> => {
      await page.goto("/bills");
      await page.locator(".bill-card h3 a").first().click();
      await expect(page).toHaveURL(/\/bills\/\d+\/[a-z]+\/\d+$/);

      await expectNoViolations(page, testInfo);
    });

    test("a member record has no WCAG 2.1 AA violations", async ({
      page,
    }: PlaywrightTestArgs & PlaywrightTestOptions, testInfo: TestInfo): Promise<void> => {
      await page.goto("/members");
      await page.locator(".member-card h3 a").first().click();
      await expect(page).toHaveURL(/\/members\/[A-Za-z0-9-]+$/);

      await expectNoViolations(page, testInfo);
    });

    test("a committee record has no WCAG 2.1 AA violations", async ({
      page,
    }: PlaywrightTestArgs & PlaywrightTestOptions, testInfo: TestInfo): Promise<void> => {
      await page.goto("/committees");
      await page.locator(".committee-card h3 a").first().click();
      await expect(page).toHaveURL(/\/committees\/(house|senate|joint)\/[a-z0-9-]+$/);

      await expectNoViolations(page, testInfo);
    });
  });
}
