"use client";

import { ArrowLeft, Gauge, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { getLab } from "@/content/labs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createLabStore, SPEEDS } from "@/store/lab-store";
import { useProgress } from "@/store/progress-store";
import { DevicePanel } from "./device-panel";
import { LabStoreContext, useLab } from "./lab-context";
import { NetworkCanvas } from "./network-canvas";
import { ObjectivesPanel, type LabNav } from "./objectives-panel";
import { PacketPanel } from "./packet-panel";
import { TerminalPanel } from "./terminal-panel";

const difficultyTone = { pemula: "green", menengah: "amber", mahir: "red" } as const;

function SpeedControl() {
  const speed = useLab((s) => s.speed);
  const setSpeed = useLab((s) => s.setSpeed);
  return (
    <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface-2 p-0.5" title="Kecepatan animasi">
      <Gauge className="mx-1 size-4 text-muted" />
      {SPEEDS.map((s) => (
        <button
          key={s}
          onClick={() => setSpeed(s)}
          className={cn("rounded-md px-2 py-1 text-xs", speed === s ? "bg-accent text-slate-950 font-semibold" : "text-slate-300 hover:bg-border")}
        >
          {s === 0 ? "Instan" : `${s}×`}
        </button>
      ))}
    </div>
  );
}

function BottomPanel() {
  const tab = useLab((s) => s.bottomTab);
  const setTab = useLab((s) => s.setBottomTab);
  const count = useLab((s) => s.packetLog.length);
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex gap-1 border-b border-border px-2 pt-1.5">
        {(
          [
            ["paket", `Paket (${count})`],
            ["perangkat", "Perangkat"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn("rounded-t-md px-3 py-1.5 text-xs font-medium", tab === id ? "bg-surface-2 text-accent" : "text-muted hover:text-slate-200")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{tab === "paket" ? <PacketPanel /> : <DevicePanel />}</div>
    </div>
  );
}

function Workspace({ nav }: { nav: LabNav }) {
  const lab = useLab((s) => s.lab);
  const reset = useLab((s) => s.reset);
  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/80 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={nav.backHref} className="flex items-center gap-1 text-sm text-muted hover:text-white">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">{nav.backLabel}</span>
          </Link>
          <div className="h-5 w-px bg-border" />
          <h1 className="truncate font-semibold text-white">{lab.title}</h1>
          <Badge tone={difficultyTone[lab.difficulty]} className="capitalize">
            {lab.difficulty}
          </Badge>
          <Badge tone="violet">{lab.xp} XP</Badge>
        </div>
        <div className="flex max-w-full items-center gap-2">
          <SpeedControl />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm("Reset lab ke kondisi awal? Semua perubahan akan hilang.")) reset();
            }}
          >
            <RotateCcw className="size-4" /> Reset
          </Button>
        </div>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-1 content-start gap-3 overflow-auto p-3 lg:grid-cols-[300px_minmax(0,1fr)_minmax(0,1.25fr)] lg:content-stretch lg:overflow-hidden">
        <div className="lg:min-h-0">
          <ObjectivesPanel nav={nav} />
        </div>
        <div className="h-[420px] min-h-0 lg:h-auto">
          <TerminalPanel />
        </div>
        <div className="flex flex-col gap-3 lg:min-h-0">
          <div className="h-[380px] min-h-0 overflow-hidden rounded-xl border border-border bg-surface/40 lg:h-auto lg:flex-[3]">
            <NetworkCanvas />
          </div>
          <div className="h-[320px] min-h-0 lg:h-auto lg:flex-[2]">
            <BottomPanel />
          </div>
        </div>
      </main>
    </div>
  );
}

export function LabWorkspace({ labId, nav }: { labId: string; nav: LabNav }) {
  const completeLab = useProgress((s) => s.completeLab);
  const [store] = useState(() => {
    const lab = getLab(labId);
    if (!lab) throw new Error(`Lab tidak ditemukan: ${labId}`);
    return createLabStore(lab, (l) => completeLab(l.id, l.xp));
  });
  return (
    <LabStoreContext.Provider value={store}>
      <Workspace nav={nav} />
    </LabStoreContext.Provider>
  );
}
