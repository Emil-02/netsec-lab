import { ShieldCheck } from "lucide-react";

export function LabLoading() {
  return (
    <div className="grid h-dvh place-items-center bg-background" aria-busy="true">
      <div className="flex animate-pulse flex-col items-center gap-3 text-muted">
        <ShieldCheck className="size-10 text-accent" />
        <span className="text-sm">Menyiapkan lab…</span>
      </div>
    </div>
  );
}
