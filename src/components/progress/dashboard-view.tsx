"use client";

import { BookOpen, FlaskConical, Brain, Trophy, Zap } from "lucide-react";
import Link from "next/link";
import { moduleIcons } from "@/components/icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { allAvailableLessons, lessonKey, modules } from "@/content/curriculum";
import { labList } from "@/content/labs";
import { levelFor, totalXp, useProgress } from "@/store/progress-store";

function Stat({ icon: Icon, label, value }: { icon: typeof Zap; label: string; value: string | number }) {
  return (
    <Card className="flex items-center gap-4">
      <div className="grid size-11 place-items-center rounded-xl bg-accent/10">
        <Icon className="size-5 text-accent" />
      </div>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-xs text-muted">{label}</div>
      </div>
    </Card>
  );
}

export function DashboardView() {
  const state = useProgress();
  if (!state.hydrated) return <p className="text-muted">Memuat progres…</p>;

  const xp = totalXp(state);
  const level = levelFor(xp);
  const lessonsDone = Object.keys(state.lessons).length;
  const labsDone = Object.keys(state.labs).length;
  const quizzes = Object.values(state.quizzes);
  const quizCorrect = quizzes.reduce((s, q) => s + q.correct, 0);
  const quizTotal = quizzes.reduce((s, q) => s + q.total, 0);
  const nextLesson = allAvailableLessons().find((x) => !state.lessons[lessonKey(x.module.slug, x.lesson.slug)]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="mt-1 text-muted">Progres belajarmu tersimpan di browser ini.</p>
        </div>
        {nextLesson && (
          <ButtonLink href={`/learn/${nextLesson.module.slug}/${nextLesson.lesson.slug}`}>Lanjutkan: {nextLesson.lesson.title}</ButtonLink>
        )}
      </div>

      <Card className="bg-gradient-to-br from-accent/15 via-surface to-accent-2/10">
        <div className="flex items-center gap-4">
          <div className="grid size-16 place-items-center rounded-2xl border-2 border-accent text-2xl font-bold text-accent">{level.level}</div>
          <div className="flex-1">
            <div className="text-sm text-muted">Level {level.level}</div>
            <div className="text-xl font-bold text-white">{level.title}</div>
            <Progress value={level.progress} className="mt-2" />
            <div className="mt-1 text-xs text-muted">{level.nextAt ? `${xp} / ${level.nextAt} XP menuju level berikutnya` : "Level maksimum tercapai!"}</div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Zap} label="Total XP" value={xp} />
        <Stat icon={BookOpen} label="Materi selesai" value={`${lessonsDone}/${allAvailableLessons().length}`} />
        <Stat icon={FlaskConical} label="Lab selesai" value={`${labsDone}/${labList.length}`} />
        <Stat icon={Brain} label="Jawaban kuis benar" value={`${quizCorrect}/${quizTotal}`} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Progres per modul</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {modules
            .filter((m) => m.available)
            .map((m) => {
              const Icon = moduleIcons[m.icon];
              const items = m.lessons.length + m.lessons.filter((l) => l.labId).length;
              const done =
                m.lessons.filter((l) => state.lessons[lessonKey(m.slug, l.slug)]).length +
                m.lessons.filter((l) => l.labId && state.labs[l.labId]).length;
              return (
                <Link key={m.slug} href={`/learn/${m.slug}`} className="rounded-xl border border-border bg-surface p-4 hover:border-accent/50">
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className="size-4 text-accent" />
                    <span className="text-sm font-medium text-slate-100">
                      {m.number}. {m.title}
                    </span>
                    <span className="ml-auto text-xs text-muted">
                      {done}/{items}
                    </span>
                  </div>
                  <Progress value={(done / items) * 100} />
                </Link>
              );
            })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
          <Trophy className="size-5 text-amber-300" /> Lab yang sudah diselesaikan
        </h2>
        {labsDone ? (
          <ul className="grid gap-2 md:grid-cols-2">
            {labList
              .filter((l) => state.labs[l.id])
              .map((l) => (
                <li key={l.id} className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2 text-sm">
                  <span className="text-slate-100">{l.title}</span>
                  <span className="text-xs text-muted">
                    +{state.labs[l.id].xp} XP · {new Date(state.labs[l.id].completedAt).toLocaleDateString("id-ID")}
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Belum ada. Ayo mulai dari <Link href="/lab/tur-lab" className="text-accent hover:underline">Tur Lab Interaktif</Link>!</p>
        )}
      </section>

      <div className="border-t border-border pt-6">
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            if (confirm("Hapus semua progres? Tindakan ini tidak bisa dibatalkan.")) state.reset();
          }}
        >
          Reset semua progres
        </Button>
        <p className="mt-2 text-xs text-muted">Sinkronisasi akun (login) akan hadir di versi berikutnya agar progres bisa dibawa ke perangkat lain.</p>
      </div>
    </div>
  );
}
