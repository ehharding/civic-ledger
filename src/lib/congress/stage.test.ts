/**
 * Covers both stage classifiers: inferBillStage's priority ordering — later/more-final stages must be checked before
 * earlier ones so a single action string can't match twice — and inferStageFromActions, whose whole reason to exist is
 * that the latest action is frequently not the most advanced one.
 */
import { describe, expect, it } from "vitest";

import { inferBillStage, inferStageFromActions, resolveBillStage } from "@/lib/congress/stage";
import type { BillAction } from "@/lib/congress/types";

/** Builds an action carrying only the fields the code classifier reads. */
function action(fields: Partial<BillAction> = {}): BillAction {
  return { text: "An action.", recordedVotes: [], ...fields };
}

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

describe("inferStageFromActions", (): void => {
  it("reads passage from the House code", (): void => {
    expect(inferStageFromActions([action({ actionCode: "8000" })])).toBe("chamber");
  });

  it("reads passage from the Senate code", (): void => {
    expect(inferStageFromActions([action({ actionCode: "17000" })])).toBe("chamber");
  });

  it("reads presentment and enactment from their codes", (): void => {
    expect(inferStageFromActions([action({ actionCode: "28000" })])).toBe("president");
    expect(inferStageFromActions([action({ actionCode: "36000" })])).toBe("law");
  });

  it("accepts the BecameLaw type as its own evidence of enactment", (): void => {
    expect(inferStageFromActions([action({ type: "BecameLaw" })])).toBe("law");
  });

  it("returns the most advanced stage regardless of where it sits in the list", (): void => {
    // The endpoint orders actions chronologically, and this app sorts them newest-first — neither of which is
    // procedural order. The passage below appears last and still has to win.
    const actions: BillAction[] = [
      action({ actionCode: "1000", text: "Introduced in House" }),
      action({ actionCode: "H11100", text: "Referred to the House Committee on Transportation." }),
      action({ actionCode: "8000", text: "Passed/agreed to in House." }),
    ];

    expect(inferStageFromActions(actions)).toBe("chamber");
  });

  it("is not walked backwards by the earlier milestones an enacted bill still carries", (): void => {
    // An enacted bill's history contains its passage and presentment too. Sorted newest-first, the *later* rows in the
    // list are the less advanced ones, so a naive "last match wins" would report a law as merely having passed.
    const actions: BillAction[] = [
      action({ actionCode: "36000", text: "Became Public Law No: 119-21." }),
      action({ actionCode: "28000", text: "Presented to President." }),
      action({ actionCode: "8000", text: "Passed/agreed to in House." }),
    ];

    expect(inferStageFromActions(actions)).toBe("law");
  });

  it("ignores floor activity, which is not passage", (): void => {
    // A bill can accumulate dozens of Floor rows — debate, motions, quorum calls — without passing anything.
    const actions: BillAction[] = [
      action({ type: "Floor", actionCode: "H8D000", text: "DEBATE - The House proceeded with debate." }),
      action({ type: "Floor", actionCode: "H30000", text: "Considered under suspension of the rules." }),
    ];

    expect(inferStageFromActions(actions)).toBeNull();
  });

  it("returns null when nothing carries a recognized code", (): void => {
    expect(inferStageFromActions([action(), action({ actionCode: "Intro-H" })])).toBeNull();
    expect(inferStageFromActions([])).toBeNull();
  });
});

describe("resolveBillStage", (): void => {
  it("corrects a bill whose latest action understates where it has got to", (): void => {
    // The real shape of HR 144 in the 119th Congress: passed the House, then referred to a Senate committee. Reading
    // only the latest action walks the bill backwards into "committee", which is the bug this function exists for.
    const latestActionText: string =
      "Received in the Senate and Read twice and referred to the Committee on Environment";

    expect(inferBillStage(latestActionText)).toBe("committee");
    expect(resolveBillStage(inferBillStage(latestActionText), [action({ actionCode: "8000" })])).toBe("chamber");
  });

  it("keeps the prose-derived stage when the action history establishes nothing", (): void => {
    expect(resolveBillStage("committee", [])).toBe("committee");
    expect(resolveBillStage("committee", [action({ actionCode: "H11100" })])).toBe("committee");
  });

  it("never walks a bill backwards from the stage its own record established", (): void => {
    // `mapCongressBill` sets "law" from the detail endpoint's published `laws` field, so this fallback is a fact rather
    // than a reading. An action history that only reaches "chamber" must not overwrite it — a page cannot print
    // "Public Law 119-21" beside a stepper that stops at *Passed a Chamber*.
    expect(resolveBillStage("law", [action({ actionCode: "8000" })])).toBe("law");
    expect(resolveBillStage("law", [action({ actionCode: "28000" })])).toBe("law");
  });

  it("still takes the action history's reading when it is the more advanced of the two", (): void => {
    expect(resolveBillStage("introduced", [action({ actionCode: "36000" })])).toBe("law");
    expect(resolveBillStage("chamber", [action({ actionCode: "28000" })])).toBe("president");
  });
});
