/** Covers CongressSwitcher's rendered options (label, year range, current-Congress flag) and its navigation on change. */
import { render, screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CongressSwitcher } from "@/components/congress-switcher";
import type { CongressHistoryEntry } from "@/lib/congress/congress-history";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const congresses: CongressHistoryEntry[] = [
  { number: 119, startYear: 2025, endYear: 2027, isCurrent: true },
  { number: 118, startYear: 2023, endYear: 2025, isCurrent: false },
  { number: 117, startYear: 2021, endYear: 2023, isCurrent: false },
];

describe("CongressSwitcher", (): void => {
  let user: UserEvent;

  beforeEach((): void => {
    pushMock.mockClear();
    user = userEvent.setup();
  });

  it("lists every Congress with its year range, flagging the current one", (): void => {
    render(<CongressSwitcher congresses={congresses} selected={119} />);

    expect(screen.getByRole("option", { name: "119th Congress · 2025–2027 (Current)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "118th Congress · 2023–2025" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "117th Congress · 2021–2023" })).toBeInTheDocument();
  });

  it("reflects the currently viewed Congress as the selected option", (): void => {
    render(<CongressSwitcher congresses={congresses} selected={118} />);
    expect(screen.getByRole("combobox")).toHaveValue("118");
  });

  it("navigates to the chosen Congress's bill directory on change", async (): Promise<void> => {
    render(<CongressSwitcher congresses={congresses} selected={119} />);

    await user.selectOptions(screen.getByRole("combobox"), "117");

    expect(pushMock).toHaveBeenCalledWith("/bills/117");
  });

  it("navigates to /bills/[congress] even when the current Congress is (re)selected", async (): Promise<void> => {
    render(<CongressSwitcher congresses={congresses} selected={118} />);

    await user.selectOptions(screen.getByRole("combobox"), "119");

    expect(pushMock).toHaveBeenCalledWith("/bills/119");
  });
});
