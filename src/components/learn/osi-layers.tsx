"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const layers = [
  { n: 7, name: "Application", id: "Aplikasi", color: "#f472b6", pdu: "Data", desc: "Antarmuka ke aplikasi pengguna: browser, email, chat.", proto: "HTTP, DNS, SSH, FTP, SMTP", tcpip: "Application", analogi: "Isi surat yang kamu tulis." },
  { n: 6, name: "Presentation", id: "Presentasi", color: "#e879f9", pdu: "Data", desc: "Format, enkripsi, dan kompresi data agar bisa dipahami kedua pihak.", proto: "TLS/SSL, JPEG, UTF-8", tcpip: "Application", analogi: "Menerjemahkan & menyegel surat." },
  { n: 5, name: "Session", id: "Sesi", color: "#c084fc", pdu: "Data", desc: "Membuka, menjaga, dan menutup sesi komunikasi.", proto: "NetBIOS, RPC", tcpip: "Application", analogi: "Membuka dan menutup percakapan telepon." },
  { n: 4, name: "Transport", id: "Transport", color: "#a78bfa", pdu: "Segment", desc: "Pengiriman ujung-ke-ujung, nomor port, keandalan (TCP) atau kecepatan (UDP).", proto: "TCP, UDP", tcpip: "Transport", analogi: "Nomor kamar/apartemen penerima (port)." },
  { n: 3, name: "Network", id: "Jaringan", color: "#60a5fa", pdu: "Packet", desc: "Pengalamatan logis (IP) dan routing antar jaringan.", proto: "IP, ICMP, (router)", tcpip: "Internet", analogi: "Alamat kota & jalan di amplop." },
  { n: 2, name: "Data Link", id: "Data Link", color: "#fbbf24", pdu: "Frame", desc: "Pengiriman di dalam satu jaringan lokal memakai alamat MAC.", proto: "Ethernet, Wi-Fi, ARP, (switch)", tcpip: "Network Access", analogi: "Kurir lokal yang tahu rumah mana yang dituju." },
  { n: 1, name: "Physical", id: "Fisik", color: "#94a3b8", pdu: "Bit", desc: "Sinyal listrik, cahaya, atau gelombang radio di media fisik.", proto: "Kabel UTP, fiber optik, radio, (hub)", tcpip: "Network Access", analogi: "Jalan raya dan truk pengangkut." },
];

export function OsiLayers() {
  const [open, setOpen] = useState<number | null>(7);
  return (
    <div className="not-prose my-8 space-y-1.5">
      {layers.map((l) => {
        const active = open === l.n;
        return (
          <button
            key={l.n}
            onClick={() => setOpen(active ? null : l.n)}
            className={cn("block w-full rounded-xl border text-left transition-all", active ? "bg-surface" : "bg-surface/50 hover:bg-surface")}
            style={{ borderColor: active ? l.color : "var(--color-border)" }}
          >
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold text-slate-950" style={{ background: l.color }}>
                {l.n}
              </span>
              <span className="font-semibold text-white">{l.name}</span>
              <span className="text-sm text-muted">· {l.id}</span>
              <span className="ml-auto rounded bg-surface-2 px-2 py-0.5 font-mono text-xs text-slate-300">{l.pdu}</span>
            </div>
            {active && (
              <div className="grid gap-2 border-t border-border px-4 py-3 text-sm sm:grid-cols-2">
                <p className="text-slate-200 sm:col-span-2">{l.desc}</p>
                <p className="text-muted"><span className="text-slate-300">Contoh:</span> {l.proto}</p>
                <p className="text-muted"><span className="text-slate-300">Di model TCP/IP:</span> {l.tcpip}</p>
                <p className="text-muted sm:col-span-2"><span className="text-slate-300">Analogi:</span> {l.analogi}</p>
              </div>
            )}
          </button>
        );
      })}
      <p className="pt-1 text-center text-xs text-muted">Klik setiap layer untuk melihat detailnya. Hafalan: <em>&quot;All People Seem To Need Data Processing&quot;</em> (7→1)</p>
    </div>
  );
}
