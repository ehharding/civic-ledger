import type { JSX } from "react";

import { HomePage } from "@/components/home-page";
import { getCongressComposition, getCongressSnapshot } from "@/lib/congress/client";
import type { CongressComposition } from "@/lib/congress/members";
import type { CongressSnapshot } from "@/lib/congress/types";

export const revalidate: number = 300;

/**
 * Home route.
 *
 * The two fetches are independent, so they go out together rather than one after the other — the membership request
 * pages through several hundred members, and there's no reason for the bill list to wait on it. Each carries its own
 * live/preview provenance and falls back independently, so a failure in one still lets the other render honestly rather
 * than taking the whole page to preview data.
 *
 * @returns The home page, with both datasets resolved server-side.
 */
export default async function Page(): Promise<JSX.Element> {
  const [snapshot, composition]: [CongressSnapshot, CongressComposition] = await Promise.all([
    getCongressSnapshot(),
    getCongressComposition(),
  ]);

  return <HomePage composition={composition} snapshot={snapshot} />;
}
