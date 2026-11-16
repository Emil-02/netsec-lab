import { Suspense } from "react";
import { LabLoading } from "@/components/lab/lab-loading";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LabWorkspace } from "@/components/lab/lab-workspace";
import type { LabNav } from "@/components/lab/objectives-panel";
import { allAvailableLessons, findLessonForLab } from "@/content/curriculum";
import { getLab, labList } from "@/content/labs";

export function generateStaticParams() {
  return labList.map((lab) => ({ labId: lab.id }));
}

export async function generateMetadata({ params }: PageProps<"/lab/[labId]">): Promise<Metadata> {
  const { labId } = await params;
  const lab = getLab(labId);
  return lab ? { title: `Lab: ${lab.title}`, description: lab.summary } : {};
}

function navFor(labId: string): LabNav {
  const owner = findLessonForLab(labId);
  if (!owner) return { backHref: "/lab", backLabel: "Daftar Lab" };
  const flat = allAvailableLessons();
  const idx = flat.findIndex((x) => x.module.slug === owner.module.slug && x.lesson.slug === owner.lesson.slug);
  const next = flat[idx + 1];
  return {
    backHref: `/learn/${owner.module.slug}/${owner.lesson.slug}`,
    backLabel: "Kembali ke materi",
    nextHref: next ? `/learn/${next.module.slug}/${next.lesson.slug}` : undefined,
    nextLabel: next?.lesson.title,
  };
}

export default function LabPage({ params }: PageProps<"/lab/[labId]">) {
  return (
    <Suspense fallback={<LabLoading />}>
      <LabContent params={params} />
    </Suspense>
  );
}

async function LabContent({ params }: Pick<PageProps<"/lab/[labId]">, "params">) {
  const { labId } = await params;
  if (!getLab(labId)) notFound();
  return <LabWorkspace labId={labId} nav={navFor(labId)} />;
}
