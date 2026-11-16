"use client";

import { Zap } from "lucide-react";
import Link from "next/link";
import { levelFor, useProgress, useXp } from "@/store/progress-store";

export function XpBadge() {
  const hydrated = useProgress((s) => s.hydrated);
  const xp = useXp();
  const level = levelFor(xp);
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs hover:border-accent/50"
      title={`Level ${level.level}: ${level.title}`}
    >
      <Zap className="size-3.5 text-amber-300" />
      <span className="font-semibold text-slate-100">{hydrated ? xp : "–"} XP</span>
      <span className="hidden text-muted sm:inline">· Lv {hydrated ? level.level : "–"}</span>
    </Link>
  );
}
