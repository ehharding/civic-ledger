import type {
  APIResponse,
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

/*
 * The nav marks which section you are in, and this is the only place that claim is tested against a real router. The
 * unit tests feed `navCurrent` a path directly and mock `usePathname` outright, so neither can catch the failure that
 * actually matters here: `usePathname` is a client hook reading a context that only exists in a real app, and a nav
 * that marks correctly on a fresh load can still go stale across a soft navigation, which is how nearly every visit
 * moves between these five pages.
 *
 * Both values are asserted because they mean different things to a screen reader — "page" only on the section's own
 * front page, "true" from a record inside it, where the current page is the record rather than the directory.
 * @see navCurrent.
 */
test("the primary nav marks the section being read, and keeps marking it across navigations", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  await page.goto("/");
  const primaryNav: Locator = page.getByRole("navigation", { name: "Primary navigation" });

  // The home route is the wordmark's destination, not one of the five, so nothing in the row claims it.
  await expect(primaryNav.locator("a[aria-current]")).toHaveCount(0);

  await primaryNav.getByRole("link", { name: "Members" }).click();
  await expect(page).toHaveURL(/\/members$/);
  await expect(primaryNav.getByRole("link", { name: "Members" })).toHaveAttribute("aria-current", "page");
  await expect(primaryNav.locator("a[aria-current]")).toHaveCount(1);

  // A soft navigation to a different section: the mark has to move, not accumulate.
  await primaryNav.getByRole("link", { name: "Committees" }).click();
  await expect(page).toHaveURL(/\/committees$/);
  await expect(primaryNav.getByRole("link", { name: "Committees" })).toHaveAttribute("aria-current", "page");
  await expect(primaryNav.locator("a[aria-current]")).toHaveCount(1);

  // And down into a record, where the section is still the one being read but is no longer the page.
  await page.goto("/bills/119/hr/134");
  await expect(primaryNav.getByRole("link", { name: "Bills" })).toHaveAttribute("aria-current", "true");
  await expect(primaryNav.locator("a[aria-current]")).toHaveCount(1);
});

/**
 * The mobile navigation drawer: the same five destinations, as a panel rather than a row. @see PrimaryNav.
 *
 * This is the one arrangement no unit test can see. jsdom applies none of the app's stylesheets, so the panel is never
 * off-screen there and its links are never out of the tab order — which means every claim the drawer's design rests on
 * (that a closed drawer offers nothing, that an open one holds the page still, that Tab stays inside it) is only ever
 * true in a browser. The component's own contract — what it marks open, what it closes on, where it puts focus — is
 * covered in `src/components/layout/primary-nav.test.tsx` and deliberately not repeated here.
 *
 * 390 × 844 is a current mid-size phone. The narrowest supported width, where the panel is at its tightest, is measured
 * in `layout.spec.ts` instead, alongside the rest of this app's geometry.
 */
test.describe("the mobile navigation drawer", (): void => {
  test.use({ viewport: { width: 390, height: 844 } });

  /*
   * The claim the whole arrangement rests on: a closed drawer is not merely off-screen, it is gone. `getByRole` reads
   * the accessibility tree, so a panel hidden with a transform alone — still focusable, still announced — would pass
   * every other assertion in this file and fail this one.
   */
  test("offers nothing until it is opened", async ({
    page,
  }: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
    await page.goto("/");

    const primaryNav: Locator = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(primaryNav.getByRole("link")).toHaveCount(0);

    const toggle: Locator = page.getByRole("button", { name: "Menu" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(primaryNav.getByRole("link")).toHaveCount(5);
  });

  test("leads to a section and closes behind you", async ({
    page,
  }: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();

    const primaryNav: Locator = page.getByRole("navigation", { name: "Primary navigation" });
    await primaryNav.getByRole("link", { name: "Committees" }).click();

    await expect(page).toHaveURL(/\/committees$/);
    await expect(page.getByRole("heading", { level: 1, name: "Where Bills Actually Go." })).toBeVisible();
    // Arriving somewhere with the menu still over it would be the drawer covering the page it just asked for.
    await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
    await expect(primaryNav.getByRole("link")).toHaveCount(0);

    // And the section is marked in the drawer exactly as it is in the row, since it is the same nav either way.
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(primaryNav.getByRole("link", { name: "Committees" })).toHaveAttribute("aria-current", "page");
  });

  test("closes when the page behind it is tapped", async ({
    page,
  }: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link")).toHaveCount(5);

    // Left of the panel, below the header: the scrim, and nothing else. A tap there has to reach the scrim rather than
    // the page underneath it, which is the assertion — the click would otherwise land on the hero.
    await page.mouse.click(40, 400);

    await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
    await expect(page).toHaveURL(/\/$/);
  });

  /*
   * WCAG 1.4.13's dismissible requirement, and the focus return that has to come with it: closing while focus is inside
   * a panel that is about to become `visibility: hidden` would drop focus to <body>, and the reader's next Tab would
   * start the page over from the skip link.
   */
  test("closes on Escape and hands focus back to the toggle", async ({
    page,
  }: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
    await page.goto("/");
    const toggle: Locator = page.getByRole("button", { name: "Menu" });
    await toggle.click();

    const firstDestination: Locator = page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Bills" });
    await firstDestination.focus();
    await expect(firstDestination).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
  });

  /*
   * The Tab loop. Without it, tabbing past the last destination walks into page content the scrim has covered — focus
   * on something the reader cannot see, in a page they cannot scroll.
   */
  test("keeps Tab inside the drawer while it is open", async ({
    page,
  }: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
    await page.goto("/");
    const toggle: Locator = page.getByRole("button", { name: "Menu" });
    await toggle.click();

    const primaryNav: Locator = page.getByRole("navigation", { name: "Primary navigation" });
    await primaryNav.getByRole("link", { name: "Methodology" }).focus();
    await page.keyboard.press("Tab");
    await expect(toggle).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(primaryNav.getByRole("link", { name: "Methodology" })).toBeFocused();

    // The loop is the drawer's, not the page's: it comes down with the drawer rather than outliving it.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await expect(toggle).not.toBeFocused();
  });

  /**
   * The drawer's own precondition, checked from the other side.
   *
   * Everything above describes a control that has to be operated, and the stylesheet is explicit that none of it
   * applies without scripting — the whole drawer block is gated on `@media (scripting: enabled)`. This is the test of
   * the half that gate protects: with scripting off, the five destinations are on the page, laid out as the wrapped
   * row this header had before the drawer existed, and the button that could not have opened them is not offered.
   *
   * Worth having as a browser test rather than as a comment, because nothing else in this project can see it. A media
   * feature is answered by the engine; jsdom has none, and a reviewer reading the stylesheet cannot tell whether
   * Chromium agrees that scripting is off. The failure it guards against is also the worst one a nav has available: a
   * hamburger with nothing behind it does not degrade to a smaller menu, it degrades to no menu at all.
   */
  test.describe("with scripting off", (): void => {
    test.use({ javaScriptEnabled: false });

    test("keeps every destination reachable, and offers no control that could not work", async ({
      page,
    }: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
      await page.goto("/");

      const primaryNav: Locator = page.getByRole("navigation", { name: "Primary navigation" });
      await expect(primaryNav.getByRole("link")).toHaveCount(5);
      await expect(primaryNav.getByRole("link", { name: "Methodology" })).toBeVisible();

      await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
    });
  });

  /* The page behind the scrim holds still, so a flick meant for the menu does not scroll the document under it. */
  test("holds the page still while it is open", async ({
    page,
  }: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();

    await page.mouse.move(40, 400);
    await page.mouse.wheel(0, 600);

    expect(await page.evaluate((): number => window.scrollY)).toBe(0);

    await page.keyboard.press("Escape");
    await page.mouse.wheel(0, 600);
    await expect.poll(async (): Promise<number> => page.evaluate((): number => window.scrollY)).toBeGreaterThan(0);
  });
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

/*
 * This app's own two API routes, checked against a running server.
 *
 * `BillDirectory`'s unit tests cover both call sites thoroughly, but they cover them against a `fetch` those tests
 * wrote the response for — the half that cannot disagree. `src/lib/api-contract.ts` settles the other half at compile
 * time, since the handler and the caller annotate one shared declaration; what is left for a browser to answer is
 * whether the running route actually replies in it.
 */

/*
 * Asserted through `request` rather than by clicking "Load More", deliberately: the button is offered only when the
 * directory holds live Congress.gov records — preview data is a fixed sample with nothing behind it — so a UI-level
 * version of this would pass locally with a key configured and time out in CI, which has none, waiting for a control
 * the page is correct not to render. The route answers in both cases, and its body is the thing under test either way.
 */
test("the load-more route answers in the shape the directory reads", async ({
  request,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  const response: APIResponse = await request.get("/api/bills?offset=12");

  // Never an error status, even with no key and no upstream: an empty page means both "there are no more" and "we could
  // not find out", which is how the button behaves in either case. @see the route handler.
  expect(response.status()).toBe(200);

  const body = (await response.json()) as Record<string, unknown>;
  expect(Object.keys(body)).toEqual(["bills"]);
  expect(Array.isArray(body["bills"])).toBe(true);
});

test("the search route answers in the shape the search box reads", async ({
  request,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  const response: APIResponse = await request.get("/api/bills/search?q=broadband");

  expect(response.status()).toBe(200);

  // The last three are the fields that exist only so the UI can describe its own reach rather than imply it swept
  // everything. A response missing one is a scope note that quietly stops being true.
  const body = (await response.json()) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["bills", "congressesSearched", "source", "truncated"]);
  expect(Array.isArray(body["bills"])).toBe(true);
});

/* And the same contract from the other end: the route's fields reaching a browser and coming back out as a sentence. */
test("searching the directory reports the scope it actually swept", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  await page.goto("/bills");

  await page.getByRole("searchbox", { name: /Search bill records/ }).fill("broadband");

  // The narrowed view is a place: what was typed comes back out as a link someone else can open. Asserted first
  // because it settles on the keystroke, which makes it the assertion that fails if the typing never reached React at
  // all — leaving the slower one below to mean what it says.
  await expect(page).toHaveURL(/\?q=broadband/);

  // Built from `congressesSearched` and `truncated`. Seeing this sentence at all also rules out the degraded local
  // fallback, which words itself differently on purpose when the route cannot be reached.
  //
  // Given room well past the default, because the work behind it is real: with a key configured the route sweeps every
  // covered Congress, and on a cold cache against a dev server that is seconds rather than milliseconds. CI has no key
  // and answers from the preview fixture immediately — the wait is headroom for a contributor's own machine, not a
  // duration anything here depends on.
  await expect(page.locator(".directory-search-note")).toContainText(/Matched against titles/, { timeout: 30_000 });
});

test("the bill-lifecycle lesson is reachable from /learn and links onward to /bills", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  await page.goto("/learn");

  await page.getByRole("link", { name: "Start the lesson: How a Bill Becomes a Law" }).click();
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

test("every lesson cites primary sources and states what it leaves out", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  // The rule `docs/roadmap.md` gated the second and third modules on, checked through the rendered page rather than
  // only in the registry: a citation list that stopped rendering would leave the prose making uncheckable claims.
  for (const slug of ["how-a-bill-becomes-law", "what-committees-do", "how-congress-votes"]) {
    await page.goto(`/learn/${slug}`);

    const sources: Locator = page.getByRole("region", { name: "Sources" });
    await expect(sources).toBeVisible();
    expect(await sources.getByRole("link").count()).toBeGreaterThan(0);

    await expect(page.getByText(/written by Civic Ledger, not published by Congress/)).toBeVisible();
    await expect(page.getByRole("region", { name: /^What This/ })).toBeVisible();
  }
});

test("the committee lesson leads to the committee directory", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  await page.goto("/learn");

  await page.getByRole("link", { name: "Start the lesson: What a Committee Actually Does" }).click();
  await expect(page).toHaveURL(/\/learn\/what-committees-do$/);

  // The lesson's headline refusal, and the one this app is most often asked for. @see docs/data-policy.md.
  await expect(page.getByText(/publish no roster/)).toBeVisible();

  await page.getByRole("link", { name: "Browse Committees" }).click();
  await expect(page).toHaveURL(/\/committees$/);
});

test("an unknown lesson slug is a 404, not an empty lesson", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  const response = await page.goto("/learn/how-a-bill-becomes-a-sandwich");
  expect(response?.status()).toBe(404);
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
  // rather than navigating. Asserting the query string is what distinguishes that from "nothing happened yet" — a bare
  // /\/members$/ would be satisfied by the un-narrowed page this test starts on, and so would pass before the filter
  // ever ran.
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

test("a committee's record collections are real links that survive a reload", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  // The whole point of making these links rather than local state: the view has an address. Everything below would pass
  // just as well against a click handler *except* the reload, which is the assertion that matters.
  await page.goto("/committees");
  await page.locator(".committee-card h3 a").first().click();

  await expect(page.getByRole("region", { name: "What Has Come Through Here" })).toBeVisible();

  await page.getByRole("link", { name: /Reports Published/ }).click();
  await expect(page).toHaveURL(/\?records=reports$/);

  const reportsTab: Locator = page.getByRole("link", { name: /Reports Published/ });
  await expect(reportsTab).toHaveAttribute("aria-current", "page");

  await page.reload();
  await expect(page.getByRole("link", { name: /Reports Published/ })).toHaveAttribute("aria-current", "page");
});

test("a defined term in a lesson explains itself and leads to its glossary entry", async ({
  page,
}: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions): Promise<void> => {
  // The three things a browser can check that jsdom cannot: the bubble is actually painted rather than merely marked
  // open, it lands inside the viewport, and the word underneath it is a working link when nothing is hovering it.
  await page.goto("/learn/what-committees-do");

  const term: Locator = page.locator(".glossary-term__word", { hasText: /^markup$/ }).first();
  const tip: Locator = page.locator(".glossary-term").filter({ has: term }).locator(".glossary-term__tip");

  await expect(tip).toBeHidden();

  await term.hover();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("The session where a committee goes through a bill and amends it.");

  const box = await tip.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (box && viewport) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
  }

  // Dismissible without moving the pointer or the focus, per WCAG 1.4.13.
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();

  await term.click();
  await expect(page).toHaveURL(/\/learn#glossary-markup$/);
  await expect(page.locator("#glossary-markup")).toBeInViewport();

  // …and in the part of the viewport nothing is painted over. `toBeInViewport` intersects rectangles and knows nothing
  // about occlusion, so it holds just as well for an entry sitting *underneath* the sticky header — which is what this
  // link used to do, landing the targeted entry ~49px behind it on a wide screen. The offset that prevents that is
  // `scroll-padding-top` on `html` (base.css), one rule covering every fragment target in the app, so checking it once
  // here is checking it for all of them.
  const headerBox = await page.locator(".site-header").boundingBox();
  const entryBox = await page.locator("#glossary-markup").boundingBox();
  expect(headerBox).not.toBeNull();
  expect(entryBox).not.toBeNull();
  if (headerBox && entryBox) expect(entryBox.y).toBeGreaterThan(headerBox.y + headerBox.height);
});
