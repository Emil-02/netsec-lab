import { Info, Lightbulb, ShieldAlert, TriangleExclamationPoint } from "lucide-react";
import { cn } from "@/lib/utils";

const styles = {
  info: { icon: Info, cls: "border-cyan-500/40 bg-cyan-500/10", iconCls: "text-cyan-300", label: "Info" },
  tip: { icon: Lightbulb, cls: "border-emerald-500/40 bg-emerald-500/10", iconCls: "text-emerald-300", label: "Tips" },
  warning: { icon: TriangleExclamationPoint, cls: "border-amber-500/40 bg-amber-500/10", iconCls: "text-amber-300", label: "Perhatian" },
  danger: { icon: ShieldAlert, cls: "border-red-500/40 bg-red-500/10", iconCls: "text-red-300", label: "Penting" },
} as const;

export function Callout({ type = "info", title, children }: { type?: keyof typeof styles; title?: string; children: React.ReactNode }) {
  const s = styles[type];
  const Icon = s.icon;
  return (
    <div className={cn("not-prose my-6 flex gap-3 rounded-xl border p-4 text-sm leading-relaxed text-slate-200", s.cls)}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", s.iconCls)} />
      <div className="min-w-0 [&_code]:rounded [&_code]:bg-black/30 [&_code]:px-1 [&_code]:font-mono [&_code]:text-accent [&_p]:mt-1 first:[&_p]:mt-0">
        <div className="mb-1 font-semibold text-white">{title ?? s.label}</div>
        {children}
      </div>
    </div>
  );
}
