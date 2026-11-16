import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const tones = {
  default: "bg-surface-2 text-slate-300 border-border",
  green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  cyan: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
  amber: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  red: "bg-red-500/10 text-red-300 border-red-500/30",
  violet: "bg-violet-500/10 text-violet-300 border-violet-500/30",
} as const;

export function Badge({ tone = "default", className, ...props }: ComponentProps<"span"> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}
