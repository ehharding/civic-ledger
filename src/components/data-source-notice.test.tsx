/** Covers DataSourceNotice's live/preview messaging branch and the custom-notice override. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataSourceNotice } from "@/components/data-source-notice";

describe("DataSourceNotice", (): void => {
  it("announces live data with the refresh cadence", (): void => {
    render(<DataSourceNotice source="live" />);

    expect(screen.getByText("Live Congress.gov Data")).toBeInTheDocument();
    expect(screen.getByText(/Refreshed from the official API every five minutes/)).toBeInTheDocument();
  });

  it("announces preview data with the default notice", (): void => {
    render(<DataSourceNotice source="preview" />);

    expect(screen.getByText("Preview Data")).toBeInTheDocument();
    expect(screen.getByText(/Add a server-only API key to use live records/)).toBeInTheDocument();
  });

  it("prefers a custom notice string over the default", (): void => {
    render(<DataSourceNotice source="preview" notice="A custom fixture notice." />);

    expect(screen.getByText(/A custom fixture notice\./)).toBeInTheDocument();
    expect(screen.queryByText(/Add a server-only API key/)).not.toBeInTheDocument();
  });

  it("reflects the source in its modifier class", (): void => {
    const { container } = render(<DataSourceNotice source="live" />);
    expect(container.querySelector("aside")).toHaveClass("source-notice--live");
  });
});
