"use client";

import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface SequenceStep {
  from: number;
  to: number | "all";
  label: string;
  detail?: string;
  color?: string;
}

const ROW_H = 46;
const TOP = 46;

export function SequenceDiagram({ title, actors, steps }: { title?: string; actors: string[]; steps: SequenceStep[] }) {
  const [shown, setShown] = useState(1);
  const colW = Math.max(150, Math.floor(640 / actors.length));
  const width = actors.length * colW;
  const height = TOP + steps.length * ROW_H + 16;
  const x = (i: number) => i * colW + colW / 2;
  const current = steps[shown - 1];

  return (
    <div className="not-prose my-8 rounded-2xl border border-border bg-surface p-5">
      {title && <div className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">{title}</div>}
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto block" style={{ width: "100%", minWidth: Math.min(width, 520), maxWidth: width }}>
          <defs>
            {steps.map((s, i) => (
              <marker key={i} id={`arrow-${i}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={s.color ?? "#34d399"} />
              </marker>
            ))}
          </defs>
          {actors.map((a, i) => (
            <g key={a}>
              <rect x={x(i) - 60} y={4} width={120} height={28} rx={8} fill="#121b2f" stroke="#334155" />
              <text x={x(i)} y={23} textAnchor="middle" fontSize={12} fontWeight={600} fill="#e2e8f0">
                {a}
              </text>
              <line x1={x(i)} y1={32} x2={x(i)} y2={height} stroke="#1f2a40" strokeDasharray="4 4" strokeWidth={2} />
            </g>
          ))}
          {steps.slice(0, shown).map((s, i) => {
            const y = TOP + i * ROW_H + 20;
            const color = s.color ?? "#34d399";
            const active = i === shown - 1;
            const targets = s.to === "all" ? actors.map((_, k) => k).filter((k) => k !== s.from) : [s.to];
            const far = targets.reduce((m, t) => (Math.abs(t - s.from) > Math.abs(m - s.from) ? t : m), targets[0]);
            const labelX = (x(s.from) + x(far)) / 2;
            return (
              <g key={i} opacity={active ? 1 : 0.55}>
                {targets.map((t) => (
                  <line
                    key={t}
                    x1={x(s.from)}
                    y1={y}
                    x2={x(t) + (t > s.from ? -4 : 4)}
                    y2={y}
                    stroke={color}
                    strokeWidth={active ? 2.5 : 2}
                    strokeDasharray={s.to === "all" ? "6 3" : undefined}
                    markerEnd={`url(#arrow-${i})`}
                  />
                ))}
                <text x={labelX} y={y - 7} textAnchor="middle" fontSize={11} fontWeight={600} fill={color}>
                  {i + 1}. {s.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-3 min-h-10 text-center text-sm text-slate-300">{current?.detail}</p>
      <div className="mt-3 flex items-center justify-center gap-2">
        <Button size="sm" variant="secondary" disabled={shown <= 1} onClick={() => setShown((n) => n - 1)}>
          <ChevronLeft className="size-4" /> Sebelumnya
        </Button>
        <span className="text-xs text-muted">
          {shown}/{steps.length}
        </span>
        {shown < steps.length ? (
          <Button size="sm" onClick={() => setShown((n) => n + 1)}>
            Berikutnya <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setShown(1)}>
            <RotateCcw className="size-4" /> Ulangi
          </Button>
        )}
      </div>
    </div>
  );
}
