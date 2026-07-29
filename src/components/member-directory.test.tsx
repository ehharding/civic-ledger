/**
 * Covers MemberDirectory's interactive contract: that every control actually narrows or reorders the grid, that the
 * count and scope note describe what is showing honestly, that filters compose and clear, that the view the URL asked
 * for is the view that renders, and that a preview roster doesn't claim to be a list of people currently holding seats.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { MemberDirectory } from "@/components/member-directory";
import type { MemberDirectoryQuery } from "@/lib/congress/member-filter";
import type { MemberDirectoryEntry } from "@/lib/congress/members";

function entry(overrides: Partial<MemberDirectoryEntry> = {}): MemberDirectoryEntry {
  return {
    bioguideId: "B000001",
    name: "Bennett, Marcus T.",
    party: "democratic",
    partyName: "Democratic",
    state: "Ohio",
    district: 9,
    chamber: "house",
    ...overrides,
  };
}

const roster: MemberDirectoryEntry[] = [
  entry(),
  entry({
    bioguideId: "A000002",
    name: "Alvarez, Priya R.",
    party: "republican",
    partyName: "Republican",
    state: "Arizona",
    district: undefined,
    chamber: "senate",
  }),
  entry({
    bioguideId: "O000003",
    name: "Okafor, Daniel K.",
    party: "democratic",
    partyName: "Democratic",
    state: "Georgia",
    district: 4,
  }),
];

function renderDirectory(props: Partial<Parameters<typeof MemberDirectory>[0]> = {}) {
  return render(<MemberDirectory congress={119} members={roster} source="live" {...props} />);
}

/** The names currently rendered as cards, in order. */
function shownNames(): string[] {
  return screen
    .getAllByRole("heading", { level: 3 })
    .map((heading: HTMLElement): string => heading.textContent ?? "")
    .filter((name: string): boolean => name.length > 0);
}

describe("MemberDirectory", (): void => {
  it("lists every member as a card linking to their own page", (): void => {
    renderDirectory();

    expect(screen.getByRole("link", { name: "Bennett, Marcus T." })).toHaveAttribute("href", "/members/B000001");
    expect(shownNames()).toHaveLength(3);
  });

  it("states how many members are showing", (): void => {
    renderDirectory();

    expect(screen.getByText("3 Members")).toBeInTheDocument();
  });

  it("names the Congress and warns that vacant seats are absent", (): void => {
    renderDirectory();

    expect(screen.getByText(/119th Congress/)).toBeInTheDocument();
    expect(screen.getByText(/Vacant seats are simply absent/)).toBeInTheDocument();
  });

  it("filters by name as the reader types", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.type(screen.getByRole("searchbox", { name: /Search members/ }), "alvarez");

    expect(shownNames()).toEqual(["Alvarez, Priya R."]);
  });

  it("filters by the place a member represents, not just their name", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.type(screen.getByRole("searchbox", { name: /Search members/ }), "georgia");

    expect(shownNames()).toEqual(["Okafor, Daniel K."]);
  });

  it("filters by chamber", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.click(screen.getByRole("button", { name: "Senate" }));

    expect(shownNames()).toEqual(["Alvarez, Priya R."]);
  });

  it("marks the active chamber as pressed, so the control's state is announced", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.click(screen.getByRole("button", { name: "House" }));

    expect(screen.getByRole("button", { name: "House" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Both Chambers" })).toHaveAttribute("aria-pressed", "false");
  });

  it("filters by party", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.selectOptions(screen.getByLabelText("Party"), "republican");

    expect(shownNames()).toEqual(["Alvarez, Priya R."]);
  });

  it("filters by state", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.selectOptions(screen.getByLabelText("State or Territory"), "Ohio");

    expect(shownNames()).toEqual(["Bennett, Marcus T."]);
  });

  it("offers only jurisdictions that are actually in the roster", (): void => {
    renderDirectory();

    const stateFilter: HTMLElement = screen.getByLabelText("State or Territory");
    expect(within(stateFilter).getByRole("option", { name: "Ohio (1)" })).toBeInTheDocument();
    expect(within(stateFilter).queryByRole("option", { name: /Wyoming/ })).not.toBeInTheDocument();
  });

  it("says how many members are behind each facet option, so a choice is predictable before it is made", (): void => {
    renderDirectory();

    const partyFilter: HTMLElement = screen.getByLabelText("Party");
    expect(within(partyFilter).getByRole("option", { name: "Democratic (2)" })).toBeInTheDocument();
    expect(within(partyFilter).getByRole("option", { name: "Republican (1)" })).toBeInTheDocument();
  });

  it("separates territories from states rather than interleaving them", (): void => {
    render(
      <MemberDirectory
        congress={119}
        members={[...roster, entry({ bioguideId: "S000004", name: "Sablan, Gregorio", state: "Guam", district: 0 })]}
        source="live"
      />,
    );

    const stateFilter: HTMLElement = screen.getByLabelText("State or Territory");
    const groups: HTMLElement[] = within(stateFilter).getAllByRole("group");

    expect(groups.map((group: HTMLElement): string | null => group.getAttribute("label"))).toEqual([
      "States",
      "Territories and Federal District",
    ]);
    expect(within(groups[1] as HTMLElement).getByRole("option", { name: "Guam (1)" })).toBeInTheDocument();
  });

  it("combines filters rather than replacing one with the next", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.click(screen.getByRole("button", { name: "House" }));
    await user.selectOptions(screen.getByLabelText("Party"), "democratic");

    expect(shownNames()).toEqual(["Bennett, Marcus T.", "Okafor, Daniel K."]);
  });

  it("says how many of the whole roster are showing once filtered", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.click(screen.getByRole("button", { name: "Senate" }));

    expect(screen.getByText("1 of 3 Members")).toBeInTheDocument();
  });

  it("offers no Clear control until there is something to clear", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    expect(screen.queryByRole("button", { name: "Clear Filters" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Senate" }));

    expect(screen.getByRole("button", { name: "Clear Filters" })).toBeInTheDocument();
  });

  it("restores the whole roster when the filters are cleared", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.type(screen.getByRole("searchbox", { name: /Search members/ }), "alvarez");
    await user.click(screen.getByRole("button", { name: "Clear Filters" }));

    expect(shownNames()).toHaveLength(3);
    expect(screen.getByRole("searchbox", { name: /Search members/ })).toHaveValue("");
  });

  it("explains an empty result instead of showing a bare empty grid", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.type(screen.getByRole("searchbox", { name: /Search members/ }), "nobody");

    expect(screen.getByRole("heading", { name: "No Members Match Those Filters." })).toBeInTheDocument();
  });

  it("does not claim a preview roster is who currently holds a seat", (): void => {
    renderDirectory({ source: "preview" });

    expect(screen.getByText(/Placeholder people/)).toBeInTheDocument();
    expect(screen.queryByText(/Vacant seats are simply absent/)).not.toBeInTheDocument();
  });

  it("describes each member's chamber and seat on their card", (): void => {
    renderDirectory();

    expect(screen.getByText("House · Ohio's 9th district")).toBeInTheDocument();
    expect(screen.getByText("Senate · Arizona")).toBeInTheDocument();
  });

  it("reorders the grid without renarrowing it", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.selectOptions(screen.getByLabelText(/Sort By/), "name-desc");

    expect(shownNames()).toEqual(["Okafor, Daniel K.", "Bennett, Marcus T.", "Alvarez, Priya R."]);
  });

  it("names a non-default order in the live region, so a reorder is announced and not merely visible", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    expect(screen.queryByText(/Sorted by/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Sort By/), "party");

    expect(screen.getByText(/Sorted by Party/)).toBeInTheDocument();
  });

  it("keeps the chosen order while the reader narrows", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.selectOptions(screen.getByLabelText(/Sort By/), "name-desc");
    await user.click(screen.getByRole("button", { name: "House" }));

    expect(shownNames()).toEqual(["Okafor, Daniel K.", "Bennett, Marcus T."]);
  });

  it("leaves the order alone when the filters are cleared, since order is not a filter", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.selectOptions(screen.getByLabelText(/Sort By/), "name-desc");
    await user.click(screen.getByRole("button", { name: "Senate" }));
    await user.click(screen.getByRole("button", { name: "Clear Filters" }));

    expect(shownNames()).toEqual(["Okafor, Daniel K.", "Bennett, Marcus T.", "Alvarez, Priya R."]);
    expect(screen.getByLabelText(/Sort By/)).toHaveValue("name-desc");
  });
});

describe("MemberDirectory, opened from a link", (): void => {
  function view(overrides: Partial<MemberDirectoryQuery["filters"]> = {}, sort: MemberDirectoryQuery["sort"] = "name") {
    return { filters: { query: "", chamber: "all", party: "all", state: "all", ...overrides }, sort } as const;
  }

  it("renders already narrowed rather than showing everyone first", (): void => {
    renderDirectory({ initialQuery: view({ chamber: "senate" }) });

    expect(shownNames()).toEqual(["Alvarez, Priya R."]);
  });

  it("shows the controls in the state the link asked for, not just the grid", (): void => {
    renderDirectory({ initialQuery: view({ query: "okafor", state: "Georgia" }, "party") });

    expect(screen.getByRole("searchbox", { name: /Search members/ })).toHaveValue("okafor");
    expect(screen.getByLabelText("State or Territory")).toHaveValue("Georgia");
    expect(screen.getByLabelText(/Sort By/)).toHaveValue("party");
  });

  it("offers a Clear control immediately, since a linked view is already narrowed", (): void => {
    renderDirectory({ initialQuery: view({ party: "democratic" }) });

    expect(screen.getByRole("button", { name: "Clear Filters" })).toBeInTheDocument();
  });
});

describe("MemberDirectory URL syncing", (): void => {
  beforeEach((): void => {
    window.history.replaceState(null, "", "/members");
  });

  it("leaves a plain visit with a clean URL", (): void => {
    renderDirectory();

    expect(window.location.search).toBe("");
  });

  it("records what the reader narrowed to, so the view can be linked or bookmarked", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.click(screen.getByRole("button", { name: "Senate" }));
    await user.selectOptions(screen.getByLabelText("Party"), "republican");

    expect(window.location.search).toBe("?chamber=senate&party=republican");
  });

  it("records the order too", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.selectOptions(screen.getByLabelText(/Sort By/), "state");

    expect(window.location.search).toBe("?sort=state");
  });

  it("empties the URL again when the filters are cleared", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.type(screen.getByRole("searchbox", { name: /Search members/ }), "alvarez");
    expect(window.location.search).toBe("?q=alvarez");

    await user.click(screen.getByRole("button", { name: "Clear Filters" }));

    expect(window.location.search).toBe("");
  });

  it("replaces history rather than pushing, so typing does not fill the back button", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    const before: number = window.history.length;
    renderDirectory();

    await user.type(screen.getByRole("searchbox", { name: /Search members/ }), "alvarez");

    expect(window.history.length).toBe(before);
  });

  it("keeps the path and any fragment, so following the skip link and then filtering does not lose either", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    window.history.replaceState(null, "", "/members#main-content");
    renderDirectory();

    await user.click(screen.getByRole("button", { name: "House" }));

    expect(window.location.pathname).toBe("/members");
    expect(window.location.hash).toBe("#main-content");
  });
});
