import { expect, type Locator, type Page, test } from "@playwright/test";

import { PAGE_ROUTES, type TestFixtures } from "./routes";

/**
 * Geometry checks axe can't make: horizontal overflow, the footer's position, and target sizes, each read off a
 * rendered rectangle.
 */

/**
 * The narrowest viewport the app promises to work at.
 *
 * WCAG 1.4.10 (Reflow) names 320 CSS pixels, and this app already agrees with it in two places — `html` carries a
 * `min-width: 320px` in base.css, and the header's breakpoint chain in responsive.css is derived down to it. Stated
 * once here so the test and the stylesheet cannot drift to different answers.
 */
const REFLOW_WIDTH: number = 320;

/** The floor WCAG 2.5.8 (Target Size, Minimum) sets for a control's hit area, in CSS pixels. */
const MIN_TARGET: number = 24;

/**
 * How far the bottom of the footer sits from the bottom of the window.
 *
 * @param page - The page to measure, already navigated.
 * @returns The gap in CSS pixels; negative when the footer is below the fold.
 */
async function footerGap(page: Page): Promise<number> {
  return page.evaluate((): number => {
    const footer: Element | null = document.querySelector(".site-footer");
    if (footer === null) throw new Error("no .site-footer on the page");

    return Math.round(window.innerHeight - footer.getBoundingClientRect().bottom);
  });
}

test.describe("reflow", (): void => {
  test.use({ viewport: { width: REFLOW_WIDTH, height: 900 } });

  /*
   * No route may scroll sideways at 320px — the symptom of a grid track whose widest child sets a floor. The message
   * names the offending elements, not just the width.
   */
  for (const route of PAGE_ROUTES) {
    test(`${route.name} does not scroll sideways at ${REFLOW_WIDTH}px`, async ({
      page,
    }: TestFixtures): Promise<void> => {
      await page.goto(route.path);
      await expect(page).toHaveTitle(/Civic Ledger/);

      const overflow = await page.evaluate((): { scrollWidth: number; clientWidth: number; culprits: string[] } => {
        const clientWidth: number = document.documentElement.clientWidth;
        const culprits: string[] = [];
        const seen: Set<string> = new Set<string>();

        for (const element of document.querySelectorAll("*")) {
          const box: DOMRect = element.getBoundingClientRect();
          if (box.right <= clientWidth + 1) continue;

          const className: string = typeof element.className === "string" ? element.className : "";
          const key: string = `${element.tagName.toLowerCase()}${className ? `.${className.split(" ")[0]}` : ""}`;
          if (seen.has(key)) continue;

          seen.add(key);
          culprits.push(`${key} (right edge ${Math.round(box.right)}px)`);
        }

        return { scrollWidth: document.documentElement.scrollWidth, clientWidth, culprits };
      });

      expect(
        overflow.scrollWidth,
        `${route.path} overflows its ${overflow.clientWidth}px viewport. Overhanging: ${
          overflow.culprits.join(", ") || "none found — check a fixed width or a negative margin"
        }`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });
  }
});

/*
 * The footer belongs at the bottom of a short page, not in the middle of one.
 *
 * `min-height: 100dvh` on the frame reserves the viewport's height but does not say who gets it; without `.page-shell`
 * claiming the remainder, a route whose content does not fill the window leaves the footer directly under the last line
 * of content with dead canvas beneath it — 400px of it on a laptop. The 404 is the shortest route the app serves, which
 * makes it the one that fails first and the right one to pin this to.
 */
test("the footer sits at the bottom of the window on a page too short to fill it", async ({
  page,
}: TestFixtures): Promise<void> => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto("/no-such-route");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await footerGap(page), "the footer is floating above the bottom of the viewport").toBeLessThanOrEqual(2);
});

/*
 * The primary nav's destinations clear the target-size floor in both arrangements: the wide-screen row (21px line
 * boxes, lifted by padding) and the drawer below 640px.
 */
test(`every primary nav destination meets the ${MIN_TARGET}px target-size floor`, async ({
  page,
}: TestFixtures): Promise<void> => {
  // 641px: one pixel above the drawer breakpoint, so this is the row at its most cramped — the nav pinned right beside
  // the wordmark, sharing a line with it.
  await page.setViewportSize({ width: 641, height: 900 });
  await page.goto("/");

  await expectDestinationsClearTheFloor(page);
});

/*
 * The same floor, in the drawer.
 *
 * Checked at the reflow width because that is the narrowest window the app promises to work in, and because the panel
 * is sized as a fraction of it — at 320px the drawer is 262px wide, which is where a row has the least to work with.
 * The toggle is measured alongside the destinations: below 640px it is the only way into any of them, so a toggle under
 * the floor is five controls under it.
 */
test(`the drawer's toggle and destinations meet the ${MIN_TARGET}px target-size floor`, async ({
  page,
}: TestFixtures): Promise<void> => {
  await page.setViewportSize({ width: REFLOW_WIDTH, height: 900 });
  await page.goto("/");

  const toggle: Locator = page.getByRole("button", { name: "Menu" });
  const toggleBox = await toggle.boundingBox();
  expect(toggleBox, "the drawer toggle has no box").not.toBeNull();
  expect(Math.round(toggleBox?.height ?? 0), "the drawer toggle is under the target-size floor").toBeGreaterThanOrEqual(
    MIN_TARGET,
  );
  expect(Math.round(toggleBox?.width ?? 0), "the drawer toggle is under the target-size floor").toBeGreaterThanOrEqual(
    MIN_TARGET,
  );

  await toggle.click();
  await expectDestinationsClearTheFloor(page);
});

/**
 * Measures every destination the primary nav currently offers, via `getByRole` — so a closed drawer fails on the count.
 *
 * @param page - The page to measure, with the nav in the state under test.
 */
async function expectDestinationsClearTheFloor(page: Page): Promise<void> {
  const links: Locator = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link");
  const count: number = await links.count();
  expect(count).toBe(5);

  for (let index = 0; index < count; index += 1) {
    const link: Locator = links.nth(index);
    const label: string = ((await link.textContent()) ?? "").trim();
    const box = await link.boundingBox();

    expect(box, `"${label}" has no box`).not.toBeNull();
    expect(Math.round(box?.height ?? 0), `"${label}" is under the target-size floor`).toBeGreaterThanOrEqual(
      MIN_TARGET,
    );
  }
}
