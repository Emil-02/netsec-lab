"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { PROTOCOL_COLORS, packetProtocol, packetSummary, type HopEvent, type Packet } from "@/engine";
import { cn } from "@/lib/utils";
import { useLab } from "./lab-context";

function Field({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-0.5 text-xs">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-slate-100">
        {value}
        {hint && <span className="ml-2 font-sans text-[10px] text-muted">{hint}</span>}
      </span>
    </div>
  );
}

function Layer({ osi, title, color, children }: { osi: string; title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-surface/60 p-2.5" style={{ borderColor: `${color}55` }}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color }}>
          {title}
        </span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{osi}</span>
      </div>
      {children}
    </div>
  );
}

const TCP_FLAG_HINTS: Record<string, string> = {
  SYN: "permintaan membuka koneksi",
  "SYN+ACK": "server setuju membuka koneksi",
  ACK: "konfirmasi",
  "PSH+ACK": "mengirim data",
  "FIN+ACK": "menutup koneksi",
  "RST+ACK": "ditolak: port tertutup",
};

export function PacketInspector({ packet, event }: { packet: Packet; event: HopEvent }) {
  const net = useLab((s) => s.net);
  const from = net.devices.get(event.from)?.name ?? event.from;
  const to = net.devices.get(event.to)?.name ?? event.to;
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted">
        Melintas dari <span className="text-slate-200">{from}</span> → <span className="text-slate-200">{to}</span>
        {event.note && <div className={cn("mt-1", event.dropped ? "text-red-300" : "text-amber-300")}>⚠ {event.note}</div>}
      </div>
      {packet.note && (
        <div className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-2 text-xs leading-relaxed text-cyan-100">🔁 {packet.note}</div>
      )}
      {packet.app && (
        <Layer
          osi={packet.app.protocol === "TLS" ? "Layer 5–6 · Enkripsi" : "Layer 7 · Aplikasi"}
          title={packet.app.protocol === "TLS" ? "TLS (terenkripsi)" : packet.app.protocol}
          color={PROTOCOL_COLORS[packet.app.protocol]}
        >
          <Field label="Ringkasan" value={packet.app.summary} />
          {packet.app.data && (
            <pre
              className={cn(
                "mt-1 max-h-40 overflow-auto rounded bg-black/40 p-2 text-[11px] whitespace-pre-wrap",
                packet.app.protocol === "TLS" && packet.app.summary.startsWith("Application") && "text-slate-500",
              )}
            >
              {packet.app.data}
            </pre>
          )}
          {packet.app.protocol === "TLS" && packet.app.summary.startsWith("Application") && (
            <p className="mt-1 text-[11px] text-emerald-300">🔒 Isi data tidak bisa dibaca tanpa kunci sesi — inilah gunanya HTTPS.</p>
          )}
        </Layer>
      )}
      {packet.icmp && (
        <Layer osi="Layer 3 · ICMP" title={`ICMP — ${packet.icmp.name}`} color={PROTOCOL_COLORS.ICMP}>
          <Field label="Type / Code" value={`${packet.icmp.type} / ${packet.icmp.code}`} />
          {packet.icmp.id !== undefined && packet.icmp.id !== 0 && <Field label="Identifier" value={packet.icmp.id} />}
          {packet.icmp.seq !== undefined && <Field label="Sequence" value={packet.icmp.seq} />}
          {packet.icmp.orig && (
            <Field
              label="Paket asal"
              value={`${packet.icmp.orig.src} → ${packet.icmp.orig.dst} (${packet.icmp.orig.protocol})`}
              hint="paket yang memicu pesan error ini"
            />
          )}
        </Layer>
      )}
      {packet.tcp && (
        <Layer osi="Layer 4 · Transport" title="TCP" color={PROTOCOL_COLORS.TCP}>
          <Field label="Port sumber" value={packet.tcp.srcPort} />
          <Field label="Port tujuan" value={packet.tcp.dstPort} />
          <Field label="Flags" value={packet.tcp.flags.join(", ")} hint={TCP_FLAG_HINTS[packet.tcp.flags.join("+")]} />
          {packet.tcp.seq !== undefined && <Field label="Seq / Ack" value={`${packet.tcp.seq} / ${packet.tcp.ack ?? 0}`} hint="nomor relatif" />}
          {packet.tcp.len !== undefined && <Field label="Panjang data" value={`${packet.tcp.len} byte`} />}
        </Layer>
      )}
      {packet.udp && (
        <Layer osi="Layer 4 · Transport" title="UDP" color={PROTOCOL_COLORS.UDP}>
          <Field label="Port sumber" value={packet.udp.srcPort} />
          <Field label="Port tujuan" value={packet.udp.dstPort} />
        </Layer>
      )}
      {packet.ip && (
        <Layer osi="Layer 3 · Network" title="IPv4" color="#e879f9">
          <Field label="IP sumber" value={packet.ip.src} />
          <Field label="IP tujuan" value={packet.ip.dst} />
          <Field label="TTL" value={packet.ip.ttl} hint="berkurang 1 tiap melewati router" />
          <Field label="Protokol" value={packet.ip.protocol} />
        </Layer>
      )}
      {packet.arp && (
        <Layer osi="Layer 2 · ARP" title={`ARP ${packet.arp.op === "request" ? "Request" : "Reply"}`} color={PROTOCOL_COLORS.ARP}>
          <Field label="Pengirim" value={`${packet.arp.senderIp} (${packet.arp.senderMac})`} />
          <Field label="Target" value={`${packet.arp.targetIp} (${packet.arp.targetMac})`} hint={packet.arp.op === "request" ? "MAC belum diketahui" : undefined} />
        </Layer>
      )}
      {packet.eth && (
        <Layer osi="Layer 2 · Data Link" title="Ethernet" color="#fbbf24">
          <Field label="MAC sumber" value={packet.eth.src} />
          <Field label="MAC tujuan" value={packet.eth.dst} hint={packet.eth.dst === "ff:ff:ff:ff:ff:ff" ? "broadcast: ke semua" : undefined} />
          <Field label="EtherType" value={packet.eth.type} />
          {packet.eth.vlan !== undefined && <Field label="802.1Q VLAN" value={packet.eth.vlan} hint="tag ditambahkan switch di link trunk" />}
        </Layer>
      )}
      <div className="rounded-lg border border-border/60 bg-surface/40 px-2.5 py-1.5 text-[11px] text-muted">
        Layer 1 · Physical — sinyal listrik/cahaya di kabel
      </div>
    </div>
  );
}

const MAX_ROWS = 300;

export function PacketPanel() {
  const packetLog = useLab((s) => s.packetLog);
  const selected = useLab((s) => s.selectedPacket);
  const selectPacket = useLab((s) => s.selectPacket);
  const net = useLab((s) => s.net);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedEntry = packetLog.find((p) => p.no === selected);

  useEffect(() => {
    const el = listRef.current;
    if (el && selected === null) el.scrollTop = el.scrollHeight;
  }, [packetLog.length, selected]);

  if (!packetLog.length) {
    return (
      <div className="grid h-full place-items-center p-4 text-center text-sm text-muted">
        <p>
          Belum ada paket. Coba jalankan perintah jaringan seperti <code className="mx-1 text-accent">ping</code> di terminal.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("grid h-full min-h-0 grid-cols-1", selectedEntry && "grid-rows-2 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:grid-rows-1")}>
      <div ref={listRef} className="min-h-0 overflow-auto border-border md:border-r">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-surface text-muted">
            <tr>
              <th className="px-2 py-1 font-medium">No.</th>
              <th className={cn("px-2 py-1 font-medium", selectedEntry && "hidden xl:table-cell")}>Waktu</th>
              <th className="px-2 py-1 font-medium">Dari → Ke</th>
              <th className="px-2 py-1 font-medium">Protokol</th>
              <th className="px-2 py-1 font-medium">Info</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {packetLog.slice(-MAX_ROWS).map((entry) => {
              const proto = packetProtocol(entry.event.packet);
              return (
                <tr
                  key={entry.no}
                  onClick={() => selectPacket(entry.no)}
                  className={cn(
                    "cursor-pointer border-t border-border/40 hover:bg-surface-2",
                    selected === entry.no && "bg-accent/15",
                    entry.event.ignored && "opacity-50",
                  )}
                >
                  <td className="px-2 py-1 text-muted">{entry.no}</td>
                  <td className={cn("px-2 py-1 text-muted", selectedEntry && "hidden xl:table-cell")}>{(entry.time / 1000).toFixed(2)}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    {net.devices.get(entry.event.from)?.name ?? entry.event.from} → {net.devices.get(entry.event.to)?.name ?? entry.event.to}
                  </td>
                  <td className="px-2 py-1 font-bold" style={{ color: PROTOCOL_COLORS[proto] }}>
                    {proto}
                  </td>
                  <td className="max-w-0 truncate px-2 py-1 text-slate-300" title={packetSummary(entry.event.packet)}>
                    {entry.event.ignored ? "(diabaikan) " : ""}
                    {packetSummary(entry.event.packet)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!selectedEntry && <p className="px-2 py-2 text-[11px] text-muted">💡 Klik sebuah baris (atau titik paket di peta) untuk membedah isinya lapis demi lapis.</p>}
      </div>
      {selectedEntry ? (
        <div className="relative min-h-0 overflow-auto border-t border-border p-3 md:border-t-0">
          <button
            onClick={() => selectPacket(null)}
            className="absolute top-2 right-2 rounded p-1 text-muted hover:bg-surface-2 hover:text-white"
            aria-label="Tutup inspektor paket"
          >
            <X className="size-4" />
          </button>
          <div className="mb-2 text-xs font-semibold text-slate-200">Paket #{selectedEntry.no}</div>
          <PacketInspector packet={selectedEntry.event.packet} event={selectedEntry.event} />
        </div>
      ) : null}
    </div>
  );
}
