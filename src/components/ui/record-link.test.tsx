/**
 * Covers the one decision `RecordLink` exists to make: record links prefetch on intent, never on sight.
 *
 * Prefetching runs only in a production build, so nothing observable in jsdom distinguishes a prefetching link from one
 * that is not. The assertions are therefore on what `next/link` is *handed*, which is the whole contract — and the
 * place a caller's own `prefetch` would otherwise slip through.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecordLink, type RecordLinkProps } from "@/components/ui/record-link";
import { billHref, memberHref } from "@/lib/routes";

const { linkProps } = vi.hoisted(() => ({ linkProps: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ prefetch, href, children, ...rest }: ComponentProps<"a"> & { prefetch?: unknown }) => {
    linkProps({ prefetch, href });
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

beforeEach((): void => {
  linkProps.mockReset();
});

/** Renders the record link most cases need, and returns its anchor. */
function renderMemberLink(props: Partial<RecordLinkProps> = {}): HTMLElement {
  render(
    <RecordLink href={memberHref("L000174")} {...props}>
      Patrick Leahy
    </RecordLink>,
  );
  return screen.getByRole("link", { name: "Patrick Leahy" });
}

/** The `prefetch` value `next/link` received on its most recent render. */
function lastPrefetch(): unknown {
  return (linkProps.mock.lastCall?.[0] as { prefetch: unknown } | undefined)?.prefetch;
}

describe("RecordLink", (): void => {
  it("does not prefetch on sight", (): void => {
    renderMemberLink();

    expect(linkProps).toHaveBeenCalledWith({ prefetch: false, href: "/members/L000174" });
  });

  it("restores the default prefetch once a pointer enters the link", (): void => {
    fireEvent.mouseEnter(renderMemberLink());

    expect(lastPrefetch()).toBeNull();
  });

  it("restores the default prefetch once a finger lands on the link", (): void => {
    fireEvent.touchStart(renderMemberLink());

    expect(lastPrefetch()).toBeNull();
  });

  it("still calls a caller's own intent handlers", (): void => {
    const onMouseEnter = vi.fn();
    const onTouchStart = vi.fn();
    const link: HTMLElement = renderMemberLink({ onMouseEnter, onTouchStart });
    fireEvent.mouseEnter(link);
    fireEvent.touchStart(link);

    expect(onMouseEnter).toHaveBeenCalledOnce();
    expect(onTouchStart).toHaveBeenCalledOnce();
  });

  it("passes everything else through to the anchor", (): void => {
    render(
      <RecordLink
        aria-current="page"
        className="text-link"
        href={billHref({ congress: 119, type: "HR", number: "284" })}
      >
        HR 284
      </RecordLink>,
    );

    const link: HTMLElement = screen.getByRole("link", { name: "HR 284" });
    expect(link).toHaveAttribute("href", "/bills/119/hr/284");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveClass("text-link");
  });
});
