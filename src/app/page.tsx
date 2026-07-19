import type { JSX } from "react";

import { HomePage } from "@/components/home-page";
import { getCongressSnapshot } from "@/lib/congress/client";
import type { CongressSnapshot } from "@/lib/congress/types";

export const revalidate: number = 300;

/** Home route. Fetches the current bill snapshot server-side and hands it to HomePage for rendering. */
export default async function Page(): Promise<JSX.Element> {
  const snapshot: CongressSnapshot = await getCongressSnapshot();
  return <HomePage snapshot={snapshot} />;
}
