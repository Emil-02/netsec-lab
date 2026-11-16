import { Suspense } from "react";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { ArrowLeft, Clock, FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { moduleIcons } from "@/components/icons";
import { LessonStatusIcon, ModuleProgress } from "@/components/progress/progress-widgets";
import { ButtonLink } from "@/components/ui/button";
import { getModule, lessonKey, modules } from "@/content/curriculum";

export function generateStaticParams() {
  return modules.filter((m) => m.available).map((m) => ({ module: m.slug }));
}

export async function generateMetadata({ params }: PageProps<"/learn/[module]">): Promise<Metadata> {
  const mod = getModule((await params).module);
  return mod ? { title: `Modul ${mod.number}: ${mod.title}`, description: mod.description } : {};
}

export default function ModulePage({ params }: PageProps<"/learn/[module]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ModuleContent params={params} />
    </Suspense>
  );
}

async function ModuleContent({ params }: Pick<PageProps<"/learn/[module]">, "params">) {
  const mod = getModule((await params).module);
  if (!mod || !mod.available) notFound();
  const Icon = moduleIcons[mod.icon];
  const first = mod.lessons[0];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/learn" className="inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="size-4" /> Kurikulum
      </Link>
      <div className="mt-6 flex items-start gap-4">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent/10">
          <Icon className="size-7 text-accent" />
        </div>
        <div>
          <p className="text-sm text-accent">Modul {mod.number}</p>
          <h1 className="text-3xl font-bold text-white">{mod.title}</h1>
          <p className="mt-2 text-muted">{mod.description}</p>
        </div>
      </div>
      <div className="mt-6">
        <ModuleProgress
          lessonKeys={mod.lessons.map((l) => lessonKey(mod.slug, l.slug))}
          labIds={mod.lessons.flatMap((l) => (l.labId ? [l.labId] : []))}
        />
      </div>
      <ol className="mt-8 space-y-2">
        {mod.lessons.map((l, i) => (
          <li key={l.slug}>
            <Link
              href={`/learn/${mod.slug}/${l.slug}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-accent/50"
            >
              <LessonStatusIcon lessonKey={lessonKey(mod.slug, l.slug)} />
              <span className="text-sm text-muted">{mod.number}.{i + 1}</span>
              <span className="flex-1 font-medium text-slate-100">{l.title}</span>
              {l.labId && (
                <span className="flex items-center gap-1 text-xs text-accent">
                  <FlaskConical className="size-3.5" /> Lab
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-muted">
                <Clock className="size-3.5" /> {l.minutes} mnt
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <ButtonLink href={`/learn/${mod.slug}/${first.slug}`} className="mt-8" size="lg">
        Mulai belajar
      </ButtonLink>
    </main>
  );
}
