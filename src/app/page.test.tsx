/**
 * Covers the home route's own job, which is narrower than the page it renders: resolve two independent datasets and
 * hand them to {@link HomePage}. The rendering is `home-page.test.tsx`'s subject; what's pinned here is the wiring.
 *
 * The claim worth testing is the one the route's comment makes and nothing else enforces — that the two fetches are
 * independent, so a failure in one still lets the other render honestly rather than dragging the whole page onto
 * preview data. That is exactly the kind of promise a well-meaning refactor to sequential `await`s would keep passing
 * every other test in the suite while quietly breaking.
 */
import { render, screen } from "@testing-library/react";
import type React from "react";
import type { JSX } from "react";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { CongressSnapshot } from "@/lib/congress/bills/model";
import type { CongressComposition } from "@/lib/congress/members/model";

const getCongressSnapshot: Mock<() => Promise<CongressSnapshot>> = vi.fn<() => Promise<CongressSnapshot>>();
const getCongressComposition: Mock<() => Promise<CongressComposition>> = vi.fn<() => Promise<CongressComposition>>();

vi.mock("@/lib/congress/client", async (importOriginal): Promise<typeof import("@/lib/congress/client")> => {
  const actual: typeof import("@/lib/congress/client") = await importOriginal();
  return { ...actual, getCongressSnapshot, getCongressComposition };
});

const { previewBills, buildPreviewComposition } = await import("@/lib/congress/upstream/fixtures");

/** A placeholder roster, stamped with a fixed time so nothing in these tests depends on the clock. */
function composition(): CongressComposition {
  return buildPreviewComposition(119, "2026-07-31T12:00:00.000Z");
}
const Page: () => Promise<JSX.Element> = (await import("@/app/page")).default;

/** A snapshot standing in for a healthy live bill fetch. */
function liveSnapshot(): CongressSnapshot {
  return { bills: previewBills, source: "live", retrievedAt: "2026-07-31T12:00:00.000Z" };
}

/** A snapshot standing in for a bill fetch that fell back. */
function previewSnapshot(): CongressSnapshot {
  return {
    bills: previewBills,
    source: "preview",
    retrievedAt: "2026-07-31T12:00:00.000Z",
    notice: "Live records are temporarily unavailable, so preview records are shown.",
  };
}

beforeEach((): void => {
  getCongressSnapshot.mockResolvedValue(liveSnapshot());
  getCongressComposition.mockResolvedValue(composition());
});

afterEach((): void => {
  vi.clearAllMocks();
});

describe("Page (home)", (): void => {
  it("renders the home page from both datasets", async (): Promise<void> => {
    render(await Page());

    expect(screen.getByRole("heading", { level: 1, name: "See Congress in Context." })).toBeInTheDocument();
    expect(getCongressSnapshot).toHaveBeenCalledTimes(1);
    expect(getCongressComposition).toHaveBeenCalledTimes(1);
  });

  it("issues both fetches together rather than waiting for the roster before asking for bills", async (): Promise<void> => {
    // The membership request pages through several hundred members. If the two were awaited in sequence, the bill list
    // would sit behind all of it — so the test holds the roster open and checks the bill fetch has already gone out.
    let releaseComposition: (composition: CongressComposition) => void = (): void => {};
    getCongressComposition.mockReturnValue(
      new Promise<CongressComposition>(
        (resolve: (value: CongressComposition | PromiseLike<CongressComposition>) => void): void => {
          releaseComposition = resolve;
        },
      ),
    );

    const pending: Promise<React.JSX.Element> = Page();
    await Promise.resolve();

    expect(getCongressSnapshot).toHaveBeenCalledTimes(1);

    releaseComposition(composition());
    render(await pending);

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("lets the bill list stay live when the roster falls back to preview data", async (): Promise<void> => {
    getCongressComposition.mockResolvedValue(composition());
    getCongressSnapshot.mockResolvedValue(liveSnapshot());

    render(await Page());

    // Each dataset carries its own provenance, so a live bill list does not inherit the roster's preview label.
    expect(screen.queryByText(/Live records are temporarily unavailable/)).not.toBeInTheDocument();
  });

  it("labels the bill list as preview when only that fetch fell back", async (): Promise<void> => {
    getCongressSnapshot.mockResolvedValue(previewSnapshot());

    render(await Page());

    expect(screen.getByText(/Live records are temporarily unavailable/)).toBeInTheDocument();
  });

  it("still renders when the bill snapshot comes back empty", async (): Promise<void> => {
    getCongressSnapshot.mockResolvedValue({ bills: [], source: "preview", retrievedAt: "2026-07-31T12:00:00.000Z" });

    render(await Page());

    // No featured bill to draw, and the page is still a page rather than an error boundary.
    expect(screen.getByRole("heading", { level: 1, name: "See Congress in Context." })).toBeInTheDocument();
  });
});
