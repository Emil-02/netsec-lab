"use client";

import { useMemo, useState } from "react";
import { inSubnet, isValidIp, parseCidr } from "@/engine/core/ip";
import { cn } from "@/lib/utils";

export interface RouteRow {
  dest: string;
  via: string;
  iface: string;
}

export function RoutingTableDemo({ routes, defaultDst = "10.20.30.40" }: { routes: RouteRow[]; defaultDst?: string }) {
  const [dst, setDst] = useState(defaultDst);
  const valid = isValidIp(dst);
  const parsed = useMemo(
    () =>
      routes.map((r) => {
        const c = r.dest === "default" ? { ip: "0.0.0.0", prefix: 0 } : parseCidr(r.dest)!;
        return { ...r, ...c };
      }),
    [routes],
  );
  const matches = valid ? parsed.filter((r) => inSubnet(dst, r.ip, r.prefix)) : [];
  const best = matches.reduce<(typeof parsed)[number] | null>((b, r) => (!b || r.prefix > b.prefix ? r : b), null);

  return (
    <div className="not-prose my-8 rounded-2xl border border-border bg-surface p-5">
      <label className="text-xs text-muted">
        Paket ditujukan ke IP:
        <input
          value={dst}
          onChange={(e) => setDst(e.target.value.trim())}
          className={cn("mt-1 block w-full rounded-md border bg-surface-2 px-3 py-2 font-mono text-base text-white sm:w-64", valid ? "border-border" : "border-red-500")}
        />
      </label>
      <table className="mt-4 w-full text-left font-mono text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-1 font-sans font-medium">Tujuan</th>
            <th className="py-1 font-sans font-medium">Prefix</th>
            <th className="py-1 font-sans font-medium">Via</th>
            <th className="py-1 font-sans font-medium">Interface</th>
            <th className="py-1 font-sans font-medium">Cocok?</th>
          </tr>
        </thead>
        <tbody>
          {parsed.map((r) => {
            const match = matches.includes(r);
            const chosen = best === r;
            return (
              <tr key={r.dest} className={cn("border-t border-border/50", chosen && "bg-accent/15", !match && "text-slate-500")}>
                <td className="py-1.5">{r.dest}</td>
                <td className="py-1.5">/{r.prefix}</td>
                <td className="py-1.5">{r.via}</td>
                <td className="py-1.5">{r.iface}</td>
                <td className="py-1.5 font-sans text-xs">{chosen ? "✅ dipilih" : match ? "cocok" : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-slate-300">
        {!valid
          ? "Masukkan alamat IP yang valid."
          : best
            ? `Beberapa rute bisa cocok, tapi router memilih yang paling spesifik (prefix terpanjang: /${best.prefix}) → kirim lewat ${best.iface}${best.via !== "langsung" ? ` ke ${best.via}` : ""}.`
            : "Tidak ada rute yang cocok — paket dibuang dan pengirim menerima pesan ICMP Destination Net Unreachable."}
      </p>
    </div>
  );
}
