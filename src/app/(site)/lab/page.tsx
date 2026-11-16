import { Clock, FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LabStatusBadge } from "@/components/progress/progress-widgets";
import { Badge } from "@/components/ui/badge";
import { findLessonForLab } from "@/content/curriculum";
import { labList } from "@/content/labs";

export const metadata: Metadata = { title: "Lab Interaktif" };

const tone = { pemula: "green", menengah: "amber", mahir: "red" } as const;

export default function LabsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-white">Lab Interaktif</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Ketik perintah di terminal dan lihat apa yang terjadi di jaringan secara visual. Setiap lab terhubung dengan materi di kurikulum.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {labList.map((lab) => {
          const owner = findLessonForLab(lab.id);
          return (
            <Link key={lab.id} href={`/lab/${lab.id}`} className="group flex flex-col rounded-xl border border-border bg-surface p-5 hover:border-accent/50">
              <div className="flex items-center justify-between">
                <div className="grid size-10 place-items-center rounded-lg bg-accent/10">
                  <FlaskConical className="size-5 text-accent" />
                </div>
                <LabStatusBadge labId={lab.id} />
              </div>
              <h2 className="mt-3 font-semibold text-white group-hover:text-accent">{lab.title}</h2>
              <p className="mt-1 flex-1 text-sm text-muted">{lab.summary}</p>
              {owner && <p className="mt-3 text-xs text-slate-400">Modul {owner.module.number}: {owner.module.title}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={tone[lab.difficulty]} className="capitalize">{lab.difficulty}</Badge>
                <Badge>
                  <Clock className="size-3" /> {lab.estimatedMinutes} mnt
                </Badge>
                <Badge tone="violet">{lab.xp} XP</Badge>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
