/**
 * Covers CommitteeDirectory's interactive contract: that every control narrows or reorders the grid, that the count
 * and scope note describe what is showing honestly, that filters compose and clear, that the view the URL asked for is
 * the view that renders, and that a preview list doesn't claim to be the committees of a real Congress.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { CommitteeDirectory } from "@/components/committee-directory";
import type { CommitteeDirectoryQuery } from "@/lib/congress/committee-filter";
import type { CommitteeSummary } from "@/lib/congress/committees";

function committee(overrides: Partial<CommitteeSummary> = {}): CommitteeSummary {
  return {
    systemCode: "hsag00",
    name: "Agriculture Committee",
    chamber: "house",
    type: "standing",
    typeName: "Standing",
    subcommitteeCount: 0,
    ...overrides,
  };
}

const list: CommitteeSummary[] = [
  committee(),
  committee({ systemCode: "ssap00", name: "Appropriations Committee", chamber: "senate" }),
  committee({ systemCode: "hsig00", name: "Intelligence Committee", type: "select" }),
  committee({ systemCode: "jsec00", name: "Joint Economic Committee", chamber: "joint", type: "joint" }),
];

function renderDirectory(props: Partial<Parameters<typeof CommitteeDirectory>[0]> = {}) {
  return render(<CommitteeDirectory committees={list} congress={119} source="live" {...props} />);
}

/**
 * The address bar is shared state across a file's tests, and this directory reads it as well as writing it — so a view
 * one test narrows to would otherwise be the view the next one starts from.
 */
beforeEach((): void => {
  window.history.replaceState(null, "", "/committees");
});

/** The committee names currently rendered as cards, in order. */
function shownNames(): string[] {
  return screen
    .getAllByRole("heading", { level: 3 })
    .map((heading: HTMLElement): string => heading.textContent ?? "")
    .filter((name: string): boolean => name.length > 0);
}

describe("CommitteeDirectory", (): void => {
  it("lists every committee as a card linking to its own page", (): void => {
    renderDirectory();

    expect(screen.getByRole("link", { name: "Agriculture Committee" })).toHaveAttribute(
      "href",
      "/committees/house/hsag00",
    );
    expect(shownNames()).toHaveLength(4);
  });

  it("states how many committees are showing", (): void => {
    renderDirectory();

    expect(screen.getByText("4 Committees")).toBeInTheDocument();
  });

  /*
   * The directory holds parent committees only, and this sentence is what keeps that from reading as an omission.
   * @see buildCommitteeDirectory.
   */
  it("names the Congress and says where subcommittees went", (): void => {
    renderDirectory();

    expect(screen.getByText(/119th Congress/)).toBeInTheDocument();
    expect(screen.getByText(/Subcommittees are listed on their parent committee's page/)).toBeInTheDocument();
  });

  it("filters by name as the reader types", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.type(screen.getByRole("searchbox", { name: /Search committees/ }), "intelligence");

    expect(shownNames()).toEqual(["Intelligence Committee"]);
    expect(screen.getByText("1 of 4 Committees")).toBeInTheDocument();
  });

  /* The whole reason both name forms are searched: this is what a reader copies off a bill's referral line. */
  it("finds a committee by the leading name form a bill page prints", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.type(screen.getByRole("searchbox", { name: /Search committees/ }), "Committee on Agriculture");

    expect(shownNames()).toEqual(["Agriculture Committee"]);
  });

  it("filters by chamber from the segmented control", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.click(screen.getByRole("button", { name: "Senate" }));

    expect(shownNames()).toEqual(["Appropriations Committee"]);
  });

  it("offers a Joint chamber the member directory has no equivalent of", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.click(screen.getByRole("button", { name: "Joint" }));

    expect(shownNames()).toEqual(["Joint Economic Committee"]);
  });

  it("filters by committee type, with each option carrying its count", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.selectOptions(screen.getByLabelText("Committee Type"), "select");

    expect(shownNames()).toEqual(["Intelligence Committee"]);
    expect(screen.getByRole("option", { name: "Standing (2)" })).toBeInTheDocument();
  });

  it("composes the facets with the search box", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.click(screen.getByRole("button", { name: "House" }));
    await user.type(screen.getByRole("searchbox", { name: /Search committees/ }), "appropriations");

    expect(screen.getByText("No Committees Match Those Filters.")).toBeInTheDocument();
  });

  it("reorders the grid without renaming the default order", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    expect(screen.queryByText(/Sorted by/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Sort By/), "name-desc");

    expect(shownNames()[0]).toBe("Joint Economic Committee");
    expect(screen.getByText(/Sorted by Name \(Z–A\)/)).toBeInTheDocument();
  });

  /* "Clear Filters" is only offered when it has something to do. */
  it("offers a clear control only once something is narrowed, and restores everything", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    expect(screen.queryByRole("button", { name: /Clear Filters/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Senate" }));
    await user.click(screen.getByRole("button", { name: /Clear Filters/ }));

    expect(shownNames()).toHaveLength(4);
  });

  /* A shared link should render narrowed on its first paint rather than flashing the whole list and then filtering. */
  it("renders the view the URL asked for on the first paint", (): void => {
    const initialQuery: CommitteeDirectoryQuery = {
      filters: { query: "", chamber: "joint", type: "all" },
      sort: "name",
    };
    renderDirectory({ initialQuery });

    expect(shownNames()).toEqual(["Joint Economic Committee"]);
  });

  it("mirrors the narrowed view into the address bar", async (): Promise<void> => {
    const user: UserEvent = userEvent.setup();
    renderDirectory();

    await user.click(screen.getByRole("button", { name: "Senate" }));

    expect(window.location.search).toBe("?chamber=senate");
  });

  it("follows the back button to the view that URL named", (): void => {
    // A `popstate` restores a URL without re-rendering anything, so the directory has to re-read the address bar
    // itself. Without this the back button would change the URL and leave the grid showing the previous view — the
    // exact bug that makes a shareable, narrowable directory feel broken.
    renderDirectory();

    act((): void => {
      window.history.replaceState(null, "", "/committees?chamber=senate&sort=name-desc");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(shownNames()).toEqual(["Appropriations Committee"]);
    expect(screen.getByRole("button", { name: "Senate" })).toHaveAttribute("aria-pressed", "true");
  });

  it("restores the unfiltered view when the back button lands on a bare URL", (): void => {
    renderDirectory({
      initialQuery: { filters: { query: "", chamber: "joint", type: "all" }, sort: "name" },
    });
    expect(shownNames()).toEqual(["Joint Economic Committee"]);

    act((): void => {
      window.history.replaceState(null, "", "/committees");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(shownNames()).toHaveLength(4);
  });

  /* A preview list is placeholder data, and the scope note has to say so rather than describing a real Congress. */
  it("does not claim a preview list is the committees of a real Congress", (): void => {
    renderDirectory({ source: "preview" });

    expect(screen.getByText(/None of these is a real committee/)).toBeInTheDocument();
    expect(screen.queryByText(/119th Congress/)).not.toBeInTheDocument();
  });
});
