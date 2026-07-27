import type { JSX } from "react";

import { HomePage } from "@/components/home-page";
import { getCongressComposition, getCongressSnapshot } from "@/lib/congress/client";
import type { CongressComposition } from "@/lib/congress/members";
import type { CongressSnapshot } from "@/lib/congress/types";

export const revalidate: number = 300;

/**
 * Home route. Fetches the current bill snapshot and the current chamber membership server-side and hands both to
 * HomePage for rendering.
 *
 * The two fetches are independent, so they go out together rather than one after the other — the membership request
 * pages through several hundred members and there's no reason for the bill list to wait on it. Each carries its own
 * live/preview provenance, and each falls back independently, so a failure in one still renders the other honestly.
 */
export default async function Page(): Promise<JSX.Element> {
  const [snapshot, composition]: [CongressSnapshot, CongressComposition] = await Promise.all([
    getCongressSnapshot(),
    getCongressComposition(),
  ]);

  return <HomePage composition={composition} snapshot={snapshot} />;
}
