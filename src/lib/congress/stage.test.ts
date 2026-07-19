/**
 * Covers inferBillStage's priority ordering — later/more-final stages must be checked before earlier ones so a single
 * action string can't match twice.
 */
import { describe, expect, it } from "vitest";

import { inferBillStage } from "@/lib/congress/stage";

describe("inferBillStage", (): void => {
  it("identifies a law before broader action language", (): void => {
    expect(inferBillStage("Signed by President. Became Public Law No: 119-7.")).toBe("law");
  });

  it("identifies a chamber-passage action", (): void => {
    expect(inferBillStage("Passed Senate with an amendment by unanimous consent.")).toBe("chamber");
  });

  it("uses a conservative introduced fallback", (): void => {
    expect(inferBillStage("Introduced in House.")).toBe("introduced");
  });
});
