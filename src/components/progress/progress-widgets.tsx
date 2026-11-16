"use client";

import { CircleCheck, Circle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LESSON_XP, useProgress } from "@/store/progress-store";

export function LessonStatusIcon({ lessonKey }: { lessonKey: string }) {
  const done = useProgress((s) => s.hydrated && !!s.lessons[lessonKey]);
  return done ? <CircleCheck className="size-4 shrink-0 text-accent" /> : <Circle className="size-4 shrink-0 text-slate-600" />;
}

export function ModuleProgress({ lessonKeys, labIds }: { lessonKeys: string[]; labIds: string[] }) {
  const done = useProgress((s) => {
    if (!s.hydrated) return 0;
    return lessonKeys.filter((k) => s.lessons[k]).length + labIds.filter((id) => s.labs[id]).length;
  });
  const total = lessonKeys.length + labIds.length;
  return (
    <div className="flex items-center gap-2">
      <Progress value={(done / total) * 100} className="h-1.5" />
      <span className="shrink-0 text-[11px] text-muted">
        {done}/{total}
      </span>
    </div>
  );
}

export function LabStatusBadge({ labId }: { labId: string }) {
  const done = useProgress((s) => s.hydrated && !!s.labs[labId]);
  return done ? (
    <Badge tone="green">
      <CircleCheck className="size-3" /> Selesai
    </Badge>
  ) : null;
}

export function LessonCompleteButton({ lessonKey, nextHref }: { lessonKey: string; nextHref?: string }) {
  const done = useProgress((s) => s.hydrated && !!s.lessons[lessonKey]);
  const completeLesson = useProgress((s) => s.completeLesson);
  const router = useRouter();
  if (done) {
    return (
      <div className="flex items-center gap-2 text-sm text-accent">
        <CircleCheck className="size-5" /> Materi ini sudah selesai
      </div>
    );
  }
  return (
    <Button
      onClick={() => {
        completeLesson(lessonKey);
        if (nextHref) router.push(nextHref);
      }}
    >
      <CircleCheck className="size-4" /> Tandai selesai (+{LESSON_XP} XP){nextHref ? " & lanjut" : ""}
    </Button>
  );
}
