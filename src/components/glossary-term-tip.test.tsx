/**
 * Covers the in-prose glossary term: what it is when nothing is running, what opens and closes the definition, and the
 * arithmetic that keeps the definition on screen.
 *
 * The accessibility contract is the substance of this component, so it is what most of these pin — the term is a real
 * link before it is anything else, the definition is reachable by keyboard as well as by pointer, and Escape dismisses
 * it without moving focus. Each of those is a WCAG 1.4.13 clause the component's own comment names.
 */
import { render, screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DEFAULT_TIP_PLACEMENT, fitTipToViewport, GlossaryTermTip } from "@/components/glossary-term-tip";
import type { GlossaryTerm } from "@/lib/glossary";

const entry: GlossaryTerm = {
  term: "Markup",
  plainEnglish: "The session where a committee goes through a bill and amends it.",
  detail: "A committee can rewrite sections, or replace the bill entirely with a substitute.",
};

/** Builds only the fields {@link fitTipToViewport} reads, so a test states a position rather than a whole rectangle. */
function boxAt(options: { left: number; right: number; top: number }): DOMRect {
  return options as DOMRect;
}

/** Renders the term and hands back the link and its definition bubble. */
function renderTerm(): { word: HTMLElement; tip: HTMLElement } {
  render(
    <GlossaryTermTip entry={entry} href="/learn#glossary-markup">
      markup
    </GlossaryTermTip>,
  );

  const word: HTMLElement = screen.getByRole("link", { name: "markup" });
  const tip: HTMLElement = screen.getByRole("tooltip", { hidden: true });

  return { word, tip };
}

describe("fitTipToViewport", (): void => {
  it("leaves a bubble that already fits exactly where it is", (): void => {
    expect(fitTipToViewport(boxAt({ left: 200, right: 500, top: 300 }), { width: 1280 })).toEqual(
      DEFAULT_TIP_PLACEMENT,
    );
  });

  it("pushes a bubble hanging off the left edge back inside", (): void => {
    // Off by 53px, plus the 8px margin it should end up clear of the edge by.
    expect(fitTipToViewport(boxAt({ left: -53, right: 315, top: 300 }), { width: 1280 })).toEqual({
      left: "calc(50% + 61px)",
      side: "above",
    });
  });

  it("pulls a bubble hanging off the right edge back inside", (): void => {
    expect(fitTipToViewport(boxAt({ left: 950, right: 1318, top: 300 }), { width: 1280 })).toEqual({
      left: "calc(50% + -46px)",
      side: "above",
    });
  });

  it("flips a bubble that would be cut off at the top to below its term", (): void => {
    expect(fitTipToViewport(boxAt({ left: 200, right: 500, top: -20 }), { width: 1280 })).toEqual({
      left: DEFAULT_TIP_PLACEMENT.left,
      side: "below",
    });
  });

  it("corrects the left edge first for a bubble wider than the viewport, which cannot satisfy both", (): void => {
    expect(fitTipToViewport(boxAt({ left: -40, right: 420, top: 300 }), { width: 320 })).toEqual({
      left: "calc(50% + 48px)",
      side: "above",
    });
  });
});

describe("GlossaryTermTip", (): void => {
  it("is a link to the term's glossary entry before it is anything else", (): void => {
    // The whole progressive-enhancement claim: with no JavaScript, no pointer, or no room for a bubble, the term still
    // does something — it goes to the full entry.
    const { word } = renderTerm();

    expect(word).toHaveAttribute("href", "/learn#glossary-markup");
  });

  it("describes the link with the definition even while the bubble is not showing", (): void => {
    // Kept mounted on purpose: a screen reader resolves `aria-describedby` at the moment focus lands, which is before
    // a bubble mounted by a state update would exist. @see the component's own comment.
    const { word, tip } = renderTerm();

    expect(word).toHaveAttribute("aria-describedby", tip.id);
    expect(tip).toHaveTextContent(entry.term);
    expect(tip).toHaveTextContent(entry.plainEnglish);
    expect(tip).toHaveTextContent(entry.detail);
    expect(tip).toHaveAttribute("data-open", "false");
  });

  it("opens on hover and closes when the pointer leaves the word and its definition", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    const { word, tip } = renderTerm();

    await user.hover(word);
    expect(tip).toHaveAttribute("data-open", "true");

    await user.unhover(word);
    expect(tip).toHaveAttribute("data-open", "false");
  });

  it("opens on focus, so the definition is reachable without a pointer", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    const { word, tip } = renderTerm();

    await user.tab();
    expect(word).toHaveFocus();
    expect(tip).toHaveAttribute("data-open", "true");

    await user.tab();
    expect(tip).toHaveAttribute("data-open", "false");
  });

  it("dismisses on Escape without moving focus", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    const { word, tip } = renderTerm();

    await user.tab();
    expect(tip).toHaveAttribute("data-open", "true");

    await user.keyboard("{Escape}");

    expect(tip).toHaveAttribute("data-open", "false");
    expect(word).toHaveFocus();
  });

  it("ignores keys that are not Escape", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    const { tip } = renderTerm();

    await user.tab();
    await user.keyboard("{ArrowDown}");

    expect(tip).toHaveAttribute("data-open", "true");
  });

  it("measures its position only while open, resetting to centered once it closes", async (): Promise<void> => {
    // jsdom reports a zero rectangle for everything, which reads as a bubble pinned to the top-left corner — so the
    // observable fact here is that a placement was applied on opening and given back on closing, not which one.
    const user: UserEvent = userEvent.setup();
    const { word, tip } = renderTerm();

    expect(tip.style.left).toBe(DEFAULT_TIP_PLACEMENT.left);

    await user.hover(word);
    expect(tip.style.left).not.toBe(DEFAULT_TIP_PLACEMENT.left);

    await user.unhover(word);
    expect(tip.style.left).toBe(DEFAULT_TIP_PLACEMENT.left);
    expect(tip).toHaveAttribute("data-side", DEFAULT_TIP_PLACEMENT.side);
  });
});
