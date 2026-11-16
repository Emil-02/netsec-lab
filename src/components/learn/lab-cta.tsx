import { FlaskConical, Play } from "lucide-react";
import { getLab } from "@/content/labs";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function LabCTA({ labId }: { labId: string }) {
  const lab = getLab(labId);
  if (!lab) return null;
  return (
    <div className="not-prose my-8 overflow-hidden rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/15 via-surface to-accent-2/10 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent/20">
            <FlaskConical className="size-6 text-accent" />
          </div>
          <div>
            <div className="text-xs font-semibold tracking-wide text-accent uppercase">Lab Praktik</div>
            <h3 className="text-lg font-bold text-white">{lab.title}</h3>
            <p className="mt-1 text-sm text-slate-300">{lab.summary}</p>
            <div className="mt-2 flex gap-2">
              <Badge tone="green" className="capitalize">{lab.difficulty}</Badge>
              <Badge>~{lab.estimatedMinutes} menit</Badge>
              <Badge tone="violet">{lab.xp} XP</Badge>
            </div>
          </div>
        </div>
        <ButtonLink href={`/lab/${lab.id}`} size="lg" className="shrink-0">
          <Play className="size-4" /> Mulai Lab
        </ButtonLink>
      </div>
    </div>
  );
}
