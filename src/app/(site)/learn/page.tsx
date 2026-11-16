import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { moduleIcons } from "@/components/icons";
import { ModuleProgress } from "@/components/progress/progress-widgets";
import { Badge } from "@/components/ui/badge";
import { lessonKey, modules, type Track } from "@/content/curriculum";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Kurikulum" };

const tracks: { track: Track; desc: string }[] = [
  { track: "Fondasi", desc: "Mulai dari sini: kenalan dengan dunia jaringan, etika, dan command line Linux." },
  { track: "Jaringan", desc: "Pahami cara data berpindah dari satu perangkat ke perangkat lain." },
  { track: "Keamanan", desc: "Pelajari cara penyerang beraksi — dan cara bertahan darinya." },
  { track: "Web", desc: "Celah keamanan paling umum di aplikasi web." },
  { track: "CTF", desc: "Uji semua kemampuanmu dalam tantangan capture the flag." },
];

export default function LearnPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-white">Kurikulum</h1>
      <p className="mt-2 max-w-2xl text-muted">
        16 modul tersusun dari nol sampai mahir. Ikuti secara berurutan — setiap modul membangun di atas modul sebelumnya.
      </p>

      {tracks.map(({ track, desc }) => {
        const mods = modules.filter((m) => m.track === track);
        return (
          <section key={track} className="mt-10">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-white">{track}</h2>
              <p className="text-sm text-muted">{desc}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {mods.map((m) => {
                const Icon = moduleIcons[m.icon];
                const card = (
                  <div
                    className={cn(
                      "h-full rounded-xl border border-border bg-surface p-5 transition-colors",
                      m.available ? "hover:border-accent/50" : "opacity-60",
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/10">
                        <Icon className="size-5 text-accent" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted">Modul {m.number}</span>
                          {!m.available && (
                            <Badge>
                              <Lock className="size-3" /> Segera hadir
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-semibold text-white">{m.title}</h3>
                        <p className="mt-1 text-sm text-muted">{m.description}</p>
                        <p className="mt-2 text-xs text-slate-400">
                          {m.lessons.length} materi · {m.lessons.filter((l) => l.labId).length} lab
                        </p>
                        {m.available && (
                          <div className="mt-3">
                            <ModuleProgress
                              lessonKeys={m.lessons.map((l) => lessonKey(m.slug, l.slug))}
                              labIds={m.lessons.flatMap((l) => (l.labId ? [l.labId] : []))}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
                return m.available ? (
                  <Link key={m.slug} href={`/learn/${m.slug}`}>
                    {card}
                  </Link>
                ) : (
                  <div key={m.slug}>{card}</div>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}
