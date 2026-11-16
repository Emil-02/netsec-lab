"use client";

import { useMemo, useState } from "react";
import { isValidIp, subnetInfo } from "@/engine/core/ip";

function Row({ label, value, mono = true }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 py-1.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className={mono ? "font-mono text-slate-100" : "text-slate-100"}>{value}</span>
    </div>
  );
}

export function SubnetCalculator({ defaultIp = "192.168.1.10", defaultPrefix = 24 }: { defaultIp?: string; defaultPrefix?: number }) {
  const [ip, setIp] = useState(defaultIp);
  const [prefix, setPrefix] = useState(defaultPrefix);
  const valid = isValidIp(ip);
  const info = useMemo(() => (valid ? subnetInfo(ip, prefix) : null), [ip, prefix, valid]);

  return (
    <div className="not-prose my-8 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 text-xs text-muted">
          Alamat IP
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value.trim())}
            className={`mt-1 block w-full rounded-md border bg-surface-2 px-3 py-2 font-mono text-base text-white ${valid ? "border-border" : "border-red-500"}`}
          />
        </label>
        <label className="text-xs text-muted">
          Prefix (CIDR): <span className="font-mono text-accent">/{prefix}</span>
          <input type="range" min={8} max={32} value={prefix} onChange={(e) => setPrefix(Number(e.target.value))} className="mt-3 block w-48 accent-emerald-400" />
        </label>
      </div>
      {!info ? (
        <p className="mt-4 text-sm text-red-300">Alamat IP tidak valid. Format: 4 angka 0–255 dipisah titik.</p>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto rounded-lg bg-black/30 p-3 font-mono text-xs leading-6">
            <div>
              <span className="inline-block w-16 text-muted">IP</span>
              {info.binaryIp.split("").map((c, i) => {
                const bitIndex = info.binaryIp.slice(0, i).replace(/\./g, "").length;
                return c === "." ? <span key={i} className="text-muted">.</span> : (
                  <span key={i} className={bitIndex < prefix ? "text-cyan-300" : "text-amber-300"}>{c}</span>
                );
              })}
            </div>
            <div>
              <span className="inline-block w-16 text-muted">Mask</span>
              {info.binaryMask.split("").map((c, i) => (c === "." ? <span key={i} className="text-muted">.</span> : <span key={i} className={c === "1" ? "text-cyan-300" : "text-slate-500"}>{c}</span>))}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              <span className="text-cyan-300">■</span> bagian network ({prefix} bit) · <span className="text-amber-300">■</span> bagian host ({32 - prefix} bit)
            </div>
          </div>
          <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
            <div>
              <Row label="Subnet mask" value={info.mask} />
              <Row label="Wildcard" value={info.wildcard} />
              <Row label="Alamat network" value={info.network} />
              <Row label="Alamat broadcast" value={info.broadcast} />
            </div>
            <div>
              <Row label="Host pertama" value={info.firstHost} />
              <Row label="Host terakhir" value={info.lastHost} />
              <Row label="Jumlah host valid" value={info.usableHosts.toLocaleString("id-ID")} />
              <Row label="Kelas / Jenis" value={`Kelas ${info.ipClass} · ${info.isPrivate ? "Privat" : "Publik"}`} mono={false} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
