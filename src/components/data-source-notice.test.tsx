/**
 * Covers DataSourceNotice's three provenance branches and the custom-notice override.
 *
 * The stored branch carries the most weight per line here. This banner is the whole mechanism behind the project's
 * central promise, and a stored copy is the one value that can be misread in *either* direction: skimmed as live it
 * overstates currency, skimmed as preview it understates that the records are real. So the heading is asserted to be
 * neither of its neighbors rather than merely to exist.
 */
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

  it("announces stored records as neither live nor preview", (): void => {
    render(<DataSourceNotice source="stored" />);

    expect(screen.getByText("Stored Congress.gov Records")).toBeInTheDocument();
    expect(screen.queryByText("Live Congress.gov Data")).not.toBeInTheDocument();
    expect(screen.queryByText("Preview Data")).not.toBeInTheDocument();
    expect(screen.getByText(/Real records this app read from Congress\.gov earlier/)).toBeInTheDocument();
  });

  it("prefers a stored read's own explanation over the default", (): void => {
    render(<DataSourceNotice source="stored" notice="Congress.gov could not be reached." />);

    expect(screen.getByText(/Congress\.gov could not be reached\./)).toBeInTheDocument();
    expect(screen.queryByText(/Real records this app read/)).not.toBeInTheDocument();
  });

  /* Live is the one source whose copy is fixed: there is nothing more specific to say than the caching policy, and a
     passed-through notice there could only ever be a leftover from a previous provenance. */
  it("ignores a notice on the live path", (): void => {
    render(<DataSourceNotice source="live" notice="A stale leftover notice." />);

    expect(screen.getByText(/Refreshed from the official API every five minutes/)).toBeInTheDocument();
    expect(screen.queryByText(/A stale leftover notice\./)).not.toBeInTheDocument();
  });

  it("prefers a custom notice string over the default", (): void => {
    render(<DataSourceNotice source="preview" notice="A custom fixture notice." />);

    expect(screen.getByText(/A custom fixture notice\./)).toBeInTheDocument();
    expect(screen.queryByText(/Add a server-only API key/)).not.toBeInTheDocument();
  });

  it("reflects the source in its modifier class", (): void => {
    expect(render(<DataSourceNotice source="live" />).container.querySelector("aside")).toHaveClass(
      "source-notice--live",
    );
    expect(render(<DataSourceNotice source="stored" />).container.querySelector("aside")).toHaveClass(
      "source-notice--stored",
    );
  });

  it("shows how long ago the data was retrieved, when provided", (): void => {
    const retrievedAt: string = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // ~2 hours ago

    render(<DataSourceNotice source="live" retrievedAt={retrievedAt} />);

    expect(screen.getByText(/Updated about 2 hours ago\./)).toBeInTheDocument();
  });

  it("omits the updated line entirely when no retrievedAt is provided", (): void => {
    render(<DataSourceNotice source="live" />);
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
  });
});
