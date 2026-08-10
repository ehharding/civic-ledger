/**
 * Covers the two placeholder primitives every `loading.tsx` route is built from.
 *
 * These are small enough to look untestable, and they are exactly the components where the thing worth testing isn't
 * the markup — it's the accessibility contract in the module comment. A grid of empty boxes must stay hidden from
 * assistive technology, and the one sentence that replaces it must be announced without interrupting. Both are easy to
 * regress with a one-word edit that no visual review would catch.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoadingStatus, SkeletonGrid } from "@/components/ui/skeleton";

describe("SkeletonGrid", (): void => {
  it("draws exactly the requested number of blocks", (): void => {
    const { container } = render(<SkeletonGrid blockClassName="skeleton--card" className="directory-grid" count={6} />);

    expect(container.querySelectorAll(".skeleton--card")).toHaveLength(6);
  });

  it("applies the caller's grid and block classes, so the placeholder matches the real page's columns", (): void => {
    const { container } = render(<SkeletonGrid blockClassName="skeleton--row" className="member-grid" count={2} />);

    const grid: Element | null = container.querySelector(".member-grid");
    expect(grid).not.toBeNull();
    expect(grid?.querySelectorAll(".skeleton--row")).toHaveLength(2);
  });

  it("hides the whole grid from assistive technology", (): void => {
    const { container } = render(<SkeletonGrid blockClassName="skeleton--card" className="directory-grid" count={3} />);

    // On the wrapper rather than each block: one `aria-hidden` subtree is what keeps a screen reader from reading out a
    // dozen contentless boxes.
    expect(container.querySelector(".directory-grid")).toHaveAttribute("aria-hidden", "true");
  });

  it("renders nothing but an empty wrapper for a count of zero", (): void => {
    const { container } = render(<SkeletonGrid blockClassName="skeleton--card" className="directory-grid" count={0} />);

    expect(container.querySelector(".directory-grid")?.children).toHaveLength(0);
  });
});

describe("LoadingStatus", (): void => {
  it("announces the message through a polite status role", (): void => {
    render(<LoadingStatus>Loading Bills…</LoadingStatus>);

    // `role="status"` and not `aria-live="assertive"`: a page that is merely still loading is not worth interrupting
    // whatever is currently being read.
    const status: HTMLElement = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading Bills…");
  });

  it("stays visually hidden, since the placeholder blocks already say this to anyone who can see them", (): void => {
    render(<LoadingStatus>Loading Members…</LoadingStatus>);

    expect(screen.getByRole("status")).toHaveClass("sr-only");
  });
});
