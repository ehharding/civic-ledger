import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { LessonArticle } from "@/components/lesson-article";
import { SiteShell } from "@/components/site-shell";
import { lessonHref } from "@/lib/lesson-route";
import { findLesson, type Lesson, lessons } from "@/lib/lessons";
import { notFoundMetadata, pageMetadata } from "@/lib/metadata";

/** The route params, as Next hands them to a dynamic segment. */
type LessonRouteParams = { slug: string };

/**
 * The learning modules, one route.
 *
 * A dynamic segment rather than a file per lesson because the lessons are already a list — `src/lib/lessons.ts` — and a
 * page file per entry would mean the same twelve lines of metadata-and-shell restated per module, which is exactly the
 * duplication `docs/roadmap.md` was about to invite by asking for two more. Adding a module is now an edit to the
 * registry: this route, the hub's index, and `sitemap.ts` all read it.
 *
 * Every slug is known at build time, so this prerenders to the same static pages the hand-written route did, and
 * `output: "export"` still works. Anything not in the registry is a 404, not an empty lesson.
 *
 * @returns One param object per lesson.
 */
export function generateStaticParams(): LessonRouteParams[] {
  return lessons.map((lesson: Lesson): LessonRouteParams => ({ slug: lesson.slug }));
}

/**
 * Names the lesson to crawlers and to the link previews a shared lesson URL renders as.
 *
 * @param props - The route's params.
 * @returns The lesson's own metadata, or a `noindex` "not found" card for a slug naming nothing.
 */
export async function generateMetadata({ params }: { params: Promise<LessonRouteParams> }): Promise<Metadata> {
  const { slug } = await params;
  const lesson: Lesson | undefined = findLesson(slug);

  if (!lesson) return notFoundMetadata("Lesson Not Found");

  return pageMetadata({ title: lesson.title, description: lesson.summary, path: lessonHref(lesson.slug) });
}

/**
 * One learning module.
 *
 * @param props - The route's params.
 * @returns The lesson body inside the site chrome.
 */
export default async function LessonPage({ params }: { params: Promise<LessonRouteParams> }): Promise<JSX.Element> {
  const { slug } = await params;
  const lesson: Lesson | undefined = findLesson(slug);

  if (!lesson) notFound();

  return (
    <SiteShell>
      <LessonArticle lesson={lesson} />
    </SiteShell>
  );
}
