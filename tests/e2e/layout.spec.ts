import type { Locator, Page, PlaywrightTestArgs, PlaywrightTestOptions } from "@playwright/test";
import { expect, test } from "@playwright/test";

/**
 * The enforcement point for the half of the accessibility baseline that `accessibility.spec.ts` cannot see.
 *
 * That file is explicit about its own limit: automated rules catch "roughly the machine-checkable half of WCAG" — a
 * missing accessible name, a broken `aria-labelledby`, a contrast failure, a skipped heading level. What axe does not
 * do is *measure the page*. It reads the accessibility tree, so a layout that pushes the document sideways, a footer
 * left floating in the middle of the window, or a link whose hit area is smaller than a fingertip all pass a clean
 * sweep.
 *
 * So this file asserts against geometry rather than against semantics, which makes it the counterpart to that one
 * rather than a duplicate of it. Everything below reads a rectangle off the rendered page.
 */

/** Every route with a layout of its own, at the shapes a reader actually meets. */
const ROUTES: readonly { path: string; name: string }[] = [
  { path: "/", name: "home" },
  { path: "/bills", name: "bill directory" },
  { path: "/members", name: "member directory" },
  { path: "/committees", name: "committee directory" },
  { path: "/learn", name: "learn hub" },
  { path: "/learn/how-a-bill-becomes-law", name: "lesson" },
  { path: "/about", name: "methodology" },
  { path: "/members?q=zzznomatch", name: "member directory, empty" },
];

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
 * Zero on a page whose content does not fill the viewport, which is the entire point of the assertion; a couple of
 * pixels of slack is left for subpixel rounding on a fractional device pixel ratio rather than demanding an exact 0.
 *
 * @param page - The page to measure, already navigated.
 * @returns The gap in CSS pixels. Negative when the footer is below the fold, which is the ordinary case for a page
 *   with enough content to scroll and is why the caller picks a short route.
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

  /**
   * No route may scroll sideways at 320px.
   *
   * The failure this catches is not cosmetic. A page wider than its window makes every line of prose on it a
   * two-directional read, and it is the characteristic symptom of a grid track that quietly refuses to shrink — a `1fr`
   * column takes its automatic minimum from its widest un-breakable child, so one long word or one rigid row inside it
   * silently sets a floor for the whole page. The two places this app is most exposed to it are the home page's hero,
   * whose featured bill carries a five-step journey stepper with a floor of its own, and the lesson pages, where a
   * glossary bubble sits on a term that can fall anywhere in a line.
   *
   * The message names the offending elements rather than only the width, because "330 > 320" on its own sends the next
   * reader binary-searching the stylesheet for it.
   */
  for (const route of ROUTES) {
    test(`${route.name} does not scroll sideways at ${REFLOW_WIDTH}px`, async ({
      page,
    }: PlaywrightTestArgs & PlaywrightTestOptions): Promise<void> => {
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

/**
 * The footer belongs at the bottom of a short page, not in the middle of one.
 *
 * `min-height: 100dvh` on the frame reserves the viewport's height but does not say who gets it; without `.page-shell`
 * claiming the remainder, a route whose content does not fill the window leaves the footer directly under the last line
 * of content with dead canvas beneath it — 400px of it on a laptop. The 404 is the shortest route the app serves, which
 * makes it the one that fails first and the right one to pin this to.
 */
test("the footer sits at the bottom of the window on a page too short to fill it", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions): Promise<void> => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto("/no-such-route");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await footerGap(page), "the footer is floating above the bottom of the viewport").toBeLessThanOrEqual(2);
});

/**
 * The primary navigation's five destinations are the most-used controls on the site, and their line boxes are the
 * smallest on it — 21px on a desktop and 18px on a phone. What lifts them over the floor is block padding rather than
 * anything visible, which is exactly the kind of rule a later change to the type scale or the header would undo
 * silently, so it is pinned here.
 *
 * Checked at the narrowest viewport because that is where the type steps down and the row wraps into a second line: the
 * boxes are smallest there, and a near miss lands on a different section of the app rather than on nothing.
 */
test(`every primary nav destination meets the ${MIN_TARGET}px target-size floor`, async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions): Promise<void> => {
  await page.setViewportSize({ width: REFLOW_WIDTH, height: 900 });
  await page.goto("/");

  const links: Locator = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link");
  const count: number = await links.count();
  expect(count).toBe(5);

  for (let index = 0; index < count; index += 1) {
    const link: Locator = links.nth(index);
    const label: string = (await link.innerText()).trim();
    const box = await link.boundingBox();

    expect(box, `"${label}" has no box`).not.toBeNull();
    expect(Math.round(box?.height ?? 0), `"${label}" is under the target-size floor`).toBeGreaterThanOrEqual(
      MIN_TARGET,
    );
  }
});
