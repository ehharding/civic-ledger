import type { BillStage } from "@/lib/congress/types";

/**
 * Congress.gov actions are prose. This intentionally conservative classifier drives a learning cue, never an
 * authoritative legal determination.
 */
export function inferBillStage(actionText: string): BillStage {
  const action: string = actionText.toLowerCase();

  if (
    action.includes("became public law") ||
    action.includes("became private law") ||
    action.includes("signed by president")
  ) {
    return "law";
  }

  if (action.includes("presented to president") || action.includes("sent to president")) {
    return "president";
  }

  if (
    action.includes("passed senate") ||
    action.includes("passed house") ||
    action.includes("agreed to in senate") ||
    action.includes("agreed to in house")
  ) {
    return "chamber";
  }

  if (
    action.includes("committee") ||
    action.includes("referred to") ||
    action.includes("reported by") ||
    action.includes("subcommittee")
  ) {
    return "committee";
  }

  return "introduced";
}
