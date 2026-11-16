"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const BITS = [128, 64, 32, 16, 8, 4, 2, 1];

export function BinaryConverter() {
  const [value, setValue] = useState(192);
  const toggle = (bit: number) => setValue((v) => v ^ bit);
  return (
    <div className="not-prose my-8 rounded-2xl border border-border bg-surface p-5">
      <p className="mb-4 text-sm text-slate-300">Klik setiap bit untuk menyalakan/mematikannya. Satu oktet = 8 bit = angka 0–255.</p>
      <div className="grid grid-cols-8 gap-1.5">
        {BITS.map((bit) => {
          const on = (value & bit) !== 0;
          return (
            <button
              key={bit}
              onClick={() => toggle(bit)}
              className={cn("rounded-lg border py-2 text-center transition-colors", on ? "border-accent bg-accent/20" : "border-border bg-surface-2")}
            >
              <div className={cn("font-mono text-2xl font-bold", on ? "text-accent" : "text-slate-600")}>{on ? 1 : 0}</div>
              <div className="text-[10px] text-muted">{bit}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
        <span className="text-muted">Desimal:</span>
        <input
          type="number"
          min={0}
          max={255}
          value={value}
          onChange={(e) => setValue(Math.max(0, Math.min(255, Number(e.target.value) || 0)))}
          className="w-24 rounded-md border border-border bg-surface-2 px-2 py-1 text-center font-mono text-lg text-white"
        />
        <span className="font-mono text-slate-300">
          = {BITS.filter((b) => value & b).join(" + ") || "0"}
        </span>
      </div>
    </div>
  );
}
