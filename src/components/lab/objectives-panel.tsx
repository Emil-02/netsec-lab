"use client";

import { CircleCheck, Circle, Lightbulb, PartyPopper, Trophy } from "lucide-react";
import { InlineMd } from "@/components/inline-md";
import { ButtonLink, Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useLab } from "./lab-context";

export interface LabNav {
  backHref: string;
  backLabel: string;
  nextHref?: string;
  nextLabel?: string;
}

export function ObjectivesPanel({ nav }: { nav: LabNav }) {
  const lab = useLab((s) => s.lab);
  const completed = useLab((s) => s.completed);
  const completedAt = useLab((s) => s.completedAt);
  const hintsRevealed = useLab((s) => s.hintsRevealed);
  const revealHint = useLab((s) => s.revealHint);
  const pct = (completed.length / lab.objectives.length) * 100;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 lg:h-full lg:min-h-0 lg:overflow-auto">
      <section className="space-y-2 text-sm leading-relaxed text-slate-300">
        {lab.briefing.map((p, i) => (
          <p key={i}>
            <InlineMd text={p} />
          </p>
        ))}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Tujuan Lab</h3>
          <span className="text-xs text-muted">
            {completed.length}/{lab.objectives.length}
          </span>
        </div>
        <Progress value={pct} className="mb-3" />
        <ol className="space-y-2">
          {lab.objectives.map((o, i) => {
            const done = completed.includes(o.id);
            return (
              <li
                key={o.id}
                className={cn(
                  "flex gap-2 rounded-lg border p-2 text-sm transition-colors",
                  done ? "border-accent/40 bg-accent/10 text-slate-200" : "border-border bg-surface-2/50 text-slate-300",
                )}
              >
                {done ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted" />}
                <span>
                  <span className="mr-1 text-muted">{i + 1}.</span>
                  <InlineMd text={o.text} />
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {completedAt ? (
        <section className="rounded-xl border border-accent/50 bg-gradient-to-br from-accent/20 to-accent-2/10 p-4 text-center">
          <PartyPopper className="mx-auto mb-2 size-8 text-accent" />
          <h3 className="font-bold text-white">Lab selesai!</h3>
          <p className="mt-1 flex items-center justify-center gap-1 text-sm text-slate-200">
            <Trophy className="size-4 text-amber-300" /> +{lab.xp} XP
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {nav.nextHref && (
              <ButtonLink href={nav.nextHref} size="sm">
                Lanjut: {nav.nextLabel}
              </ButtonLink>
            )}
            <ButtonLink href={nav.backHref} size="sm" variant="secondary">
              {nav.backLabel}
            </ButtonLink>
          </div>
        </section>
      ) : null}

      {lab.hints.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-100">Petunjuk</h3>
          <ul className="space-y-2">
            {lab.hints.slice(0, hintsRevealed).map((h, i) => (
              <li key={i} className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                <Lightbulb className="size-4 shrink-0 text-amber-300" />
                <span>
                  <InlineMd text={h} />
                </span>
              </li>
            ))}
          </ul>
          {hintsRevealed < lab.hints.length && (
            <Button size="sm" variant="ghost" className="mt-2 w-full border border-dashed border-border" onClick={revealHint}>
              <Lightbulb className="size-4" /> Tampilkan petunjuk ({hintsRevealed + 1}/{lab.hints.length})
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
