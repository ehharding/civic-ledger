import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { SiteShell } from "@/components/layout/site-shell";
import { LessonArticle } from "@/components/learn/lesson-article";
import { findLesson, type Lesson, lessons } from "@/lib/lessons";
import { notFoundMetadata, pageMetadata } from "@/lib/metadata";
import { lessonHref } from "@/lib/routes";

/**
 * The route params, as Next hands them to a dynamic segment. A plain string rather than the registry's `LessonSlug` on
 * purpose: this is what arrived in the URL, so it is any string at all until {@link findLesson} says otherwise.
 */
type LessonRouteParams = { slug: string };

/** Params for the individual lesson route (`/learn/[slug]`). */
type LessonPageProps = {
  params: Promise<LessonRouteParams>;
};

/**
 * One static page per lesson in `src/lib/lessons.ts`; any other slug is a 404.
 *
 * @returns One param object per lesson.
 */
export function generateStaticParams(): LessonRouteParams[] {
  return lessons.map((lesson: Lesson): LessonRouteParams => ({ slug: lesson.slug }));
}

/**
 * Names the lesson to crawlers and to the link previews a shared lesson URL renders as.
 *
 * @param params - The lesson's route params.
 * @returns The lesson's own metadata, or a `noindex` "not found" card for a slug naming nothing.
 * @see LessonPageProps
 */
export async function generateMetadata({ params }: LessonPageProps): Promise<Metadata> {
  const { slug } = await params;
  const lesson: Lesson | undefined = findLesson(slug);

  if (!lesson) return notFoundMetadata("Lesson Not Found");

  return pageMetadata({ title: lesson.title, description: lesson.summary, path: lessonHref(lesson.slug) });
}

/**
 * One learning module.
 *
 * @param params - The lesson's route params.
 * @returns The lesson body inside the site chrome.
 * @see LessonPageProps
 */
export default async function LessonPage({ params }: LessonPageProps): Promise<JSX.Element> {
  const { slug } = await params;
  const lesson: Lesson | undefined = findLesson(slug);

  if (!lesson) notFound();

  return (
    <SiteShell>
      <LessonArticle lesson={lesson} />
    </SiteShell>
  );
}
