"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const steps = [
  { label: "Data", color: "#f472b6", layer: "Aplikasi", text: "Browser membuat data: \"GET /index.html\"" },
  { label: "TCP", color: "#a78bfa", layer: "Transport", text: "Ditambah header TCP: port sumber 51000 → port tujuan 80. Sekarang disebut segment." },
  { label: "IP", color: "#60a5fa", layer: "Network", text: "Ditambah header IP: 192.168.1.10 → 93.184.216.34, TTL 64. Sekarang disebut packet." },
  { label: "Ethernet", color: "#fbbf24", layer: "Data Link", text: "Ditambah header Ethernet (MAC sumber & tujuan) dan trailer FCS. Sekarang disebut frame." },
  { label: "Bit", color: "#94a3b8", layer: "Physical", text: "Frame diubah menjadi deretan bit 0101… dan dikirim sebagai sinyal di kabel." },
];

export function EncapsulationDemo() {
  const [step, setStep] = useState(0);
  const headers = steps.slice(1, Math.min(step, 3) + 1).reverse();
  return (
    <div className="not-prose my-8 rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 text-xs font-semibold tracking-wide text-muted uppercase">
        Langkah {step + 1}/{steps.length} · Layer {steps[step].layer}
      </div>
      <div className="flex min-h-20 items-center justify-center overflow-x-auto py-2">
        {step === 4 ? (
          <div className="font-mono text-sm break-all text-slate-300">01000111 01000101 01010100 00100000 00101111 01101001 …</div>
        ) : (
          <div className="flex items-stretch font-mono text-xs">
            {headers.map((h) => (
              <div key={h.label} className="flex items-center rounded-l-md border px-3 py-3 font-bold text-slate-950" style={{ background: h.color, borderColor: h.color }}>
                {h.label}
              </div>
            ))}
            <div className="flex items-center border px-4 py-3 font-bold text-slate-950" style={{ background: steps[0].color, borderColor: steps[0].color }}>
              Data
            </div>
            {step >= 3 && <div className="flex items-center rounded-r-md bg-amber-300 px-2 py-3 font-bold text-slate-950">FCS</div>}
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-sm text-slate-300">{steps[step].text}</p>
      <div className="mt-4 flex justify-center gap-2">
        <Button size="sm" variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          ← Buka bungkus
        </Button>
        <Button size="sm" disabled={step === steps.length - 1} onClick={() => setStep((s) => s + 1)}>
          Bungkus lagi →
        </Button>
      </div>
    </div>
  );
}
