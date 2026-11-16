import { Suspense } from "react";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { ArrowLeft, ArrowRight, Clock, FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonCompleteButton, LessonStatusIcon } from "@/components/progress/progress-widgets";
import { allAvailableLessons, getLesson, lessonKey } from "@/content/curriculum";
import { lessonContent } from "@/content/lesson-content";
import { cn } from "@/lib/utils";

export function generateStaticParams() {
  return allAvailableLessons().map(({ module, lesson }) => ({ module: module.slug, lesson: lesson.slug }));
}

export async function generateMetadata({ params }: PageProps<"/learn/[module]/[lesson]">): Promise<Metadata> {
  const { module, lesson } = await params;
  const found = getLesson(module, lesson);
  return found ? { title: found.lesson.title, description: found.module.description } : {};
}

export default function LessonPage({ params }: PageProps<"/learn/[module]/[lesson]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LessonContent params={params} />
    </Suspense>
  );
}

async function LessonContent({ params }: Pick<PageProps<"/learn/[module]/[lesson]">, "params">) {
  const { module: moduleSlug, lesson: lessonSlug } = await params;
  const found = getLesson(moduleSlug, lessonSlug);
  const key = lessonKey(moduleSlug, lessonSlug);
  const Content = lessonContent[key];
  if (!found || !found.module.available || !Content) notFound();

  const { module: mod, lesson } = found;
  const flat = allAvailableLessons();
  const idx = flat.findIndex((x) => x.module.slug === mod.slug && x.lesson.slug === lesson.slug);
  const prev = flat[idx - 1];
  const next = flat[idx + 1];
  const href = (x: (typeof flat)[number]) => `/learn/${x.module.slug}/${x.lesson.slug}`;
  const lessonIndex = mod.lessons.findIndex((l) => l.slug === lesson.slug);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <Link href={`/learn/${mod.slug}`} className="text-xs font-semibold tracking-wide text-accent uppercase hover:underline">
            Modul {mod.number}: {mod.title}
          </Link>
          <ol className="mt-3 space-y-1">
            {mod.lessons.map((l) => (
              <li key={l.slug}>
                <Link
                  href={`/learn/${mod.slug}/${l.slug}`}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                    l.slug === lesson.slug ? "bg-surface-2 text-white" : "text-muted hover:text-white",
                  )}
                >
                  <LessonStatusIcon lessonKey={lessonKey(mod.slug, l.slug)} />
                  <span className="flex-1">{l.title}</span>
                  {l.labId && <FlaskConical className="size-3.5 text-accent" />}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </aside>

      <main className="min-w-0">
        <div className="mb-6">
          <Link href={`/learn/${mod.slug}`} className="text-sm text-muted hover:text-white lg:hidden">
            ← Modul {mod.number}: {mod.title}
          </Link>
          <p className="mt-2 text-sm text-accent">
            {mod.number}.{lessonIndex + 1}
          </p>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">{lesson.title}</h1>
          <p className="mt-2 flex items-center gap-1 text-sm text-muted">
            <Clock className="size-4" /> {lesson.minutes} menit membaca
          </p>
        </div>

        <article className="prose prose-invert max-w-none prose-headings:scroll-mt-20 prose-a:text-accent prose-th:text-slate-200 prose-table:text-sm">
          <Content />
        </article>

        <div className="mt-12 rounded-xl border border-border bg-surface p-5">
          <LessonCompleteButton lessonKey={key} nextHref={next ? href(next) : undefined} />
        </div>

        <nav className="mt-6 grid gap-3 sm:grid-cols-2">
          {prev ? (
            <Link href={href(prev)} className="rounded-xl border border-border p-4 hover:border-accent/50">
              <span className="flex items-center gap-1 text-xs text-muted">
                <ArrowLeft className="size-3" /> Sebelumnya
              </span>
              <span className="mt-1 block font-medium text-slate-100">{prev.lesson.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={href(next)} className="rounded-xl border border-border p-4 text-right hover:border-accent/50">
              <span className="flex items-center justify-end gap-1 text-xs text-muted">
                Berikutnya <ArrowRight className="size-3" />
              </span>
              <span className="mt-1 block font-medium text-slate-100">{next.lesson.title}</span>
            </Link>
          )}
        </nav>
      </main>
    </div>
  );
}
