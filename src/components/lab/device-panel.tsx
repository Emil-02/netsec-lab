"use client";

import { Terminal } from "lucide-react";
import { broadcastAddress } from "@/engine";
import { deviceColors, deviceIcons, deviceKindLabel } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useLab } from "./lab-context";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{title}</h4>
      {children}
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <p className="text-xs text-muted italic">{empty}</p>;
  return (
    <table className="w-full text-left font-mono text-[11px]">
      <thead className="text-muted">
        <tr>
          {head.map((h) => (
            <th key={h} className="py-0.5 pr-3 font-sans font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border/40">
            {r.map((c, j) => (
              <td key={j} className="py-0.5 pr-3">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const KIND_INFO: Record<string, string> = {
  internet: "Router milik penyedia internet (ISP). Tidak mau meneruskan paket ke alamat IP privat.",
  switch: "Switch mempelajari MAC address dari setiap frame yang masuk, lalu hanya meneruskan frame ke port tujuan.",
  hub: "Hub tidak punya tabel MAC. Ia hanya mengulang (flood) setiap sinyal ke SEMUA port lainnya.",
  router: "Router menghubungkan jaringan yang berbeda dan memilih jalur berdasarkan tabel routing.",
};

export function DevicePanel() {
  const selectedId = useLab((s) => s.selectedDevice);
  const net = useLab((s) => s.net);
  useLab((s) => s.version);
  const controllable = useLab((s) => s.lab.controllable);
  const activeDevice = useLab((s) => s.activeDevice);
  const running = useLab((s) => s.running);
  const setActiveDevice = useLab((s) => s.setActiveDevice);

  const device = selectedId ? net.devices.get(selectedId) : null;
  if (!device) {
    return <div className="grid h-full place-items-center p-4 text-center text-sm text-muted">Klik sebuah perangkat di peta untuk melihat detailnya.</div>;
  }
  const Icon = deviceIcons[device.kind];
  const isL2 = device.kind === "switch" || device.kind === "hub";
  const neighbour = (port: string) => {
    const link = net.linkAt(device.id, port);
    return link ? (net.devices.get(link.peer.device)?.name ?? "-") : "-";
  };
  const macOwner = (mac: string) =>
    [...net.devices.values()].find((d) => d.interfaces.some((i) => i.mac === mac))?.name ?? "?";

  return (
    <div className="h-full space-y-3 overflow-auto p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl border-2" style={{ borderColor: deviceColors[device.kind] }}>
            <Icon className="size-5" style={{ color: deviceColors[device.kind] }} />
          </div>
          <div>
            <div className="font-semibold text-slate-100">{device.name}</div>
            <div className="text-xs text-muted">
              {deviceKindLabel[device.kind]}
              {!isL2 && ` · hostname: ${device.hostname}`}
            </div>
          </div>
        </div>
        {controllable.includes(device.id) && device.id !== activeDevice && (
          <Button size="sm" variant="secondary" disabled={running} onClick={() => setActiveDevice(device.id)}>
            <Terminal className="size-3.5" /> Kendalikan
          </Button>
        )}
      </div>
      {KIND_INFO[device.kind] && <p className="text-xs text-muted">{KIND_INFO[device.kind]}</p>}

      <Section title={isL2 ? "Port" : "Interface"}>
        <Table
          head={isL2 ? (device.kind === "switch" ? ["Port", "Status", "VLAN", "Terhubung ke"] : ["Port", "Status", "Terhubung ke"]) : ["Nama", "IP", "MAC", "Broadcast"]}
          rows={device.interfaces.map((i) =>
            isL2
              ? device.kind === "switch"
                ? [i.name, i.up ? "UP" : "DOWN", i.trunk ? "trunk" : (i.vlan ?? 1), neighbour(i.name)]
                : [i.name, i.up ? "UP" : "DOWN", neighbour(i.name)]
              : [i.name, i.ip ? `${i.ip}/${i.prefix}` : "-", i.mac, i.ip && i.prefix !== undefined ? broadcastAddress(i.ip, i.prefix) : "-"],
          )}
          empty="Tidak ada interface"
        />
      </Section>

      {device.kind === "switch" && (
        <Section title="MAC Address Table">
          <Table
            head={["VLAN", "MAC", "Port", "Milik"]}
            rows={[...device.macTable.values()].map((e) => [e.vlan, e.mac, e.port, macOwner(e.mac)])}
            empty="Masih kosong — switch belum melihat frame apa pun."
          />
        </Section>
      )}

      {!isL2 && (
        <>
          <Section title="Tabel Routing">
            <Table
              head={["Tujuan", "Via", "Interface"]}
              rows={[
                ...net.connectedRoutes(device).map((r) => [`${r.network}/${r.prefix}`, "langsung", r.iface]),
                ...device.routes.map((r) => [
                  r.prefix === 0 ? "default" : `${r.network}/${r.prefix}`,
                  r.via,
                  net.lookupRoute(device, r.via)?.iface ?? "?",
                ]),
              ]}
              empty="Tidak ada rute — perangkat ini belum punya IP."
            />
          </Section>
          <Section title="Tabel ARP (IP → MAC)">
            <Table
              head={["IP", "MAC", "Interface"]}
              rows={[...device.arp.entries()].map(([ip, e]) => [ip, e.mac, e.iface])}
              empty="Kosong — belum berkomunikasi dengan siapa pun."
            />
          </Section>
          {device.services.length > 0 && (
            <Section title="Layanan yang berjalan (port listening)">
              <Table
                head={["Port", "Protokol", "Layanan", "Alamat"]}
                rows={device.services.map((sv) => [sv.port, sv.protocol.toUpperCase(), sv.name, sv.bind ?? "0.0.0.0 (semua)"])}
                empty=""
              />
            </Section>
          )}
          {device.dns && (
            <Section title={`DNS Server${device.dns.forwarder ? ` (forward ke ${device.dns.forwarder})` : ""}`}>
              <Table head={["Nama", "Tipe", "Nilai"]} rows={device.dns.records.map((r) => [r.name, r.type, r.value])} empty="Tidak ada record" />
            </Section>
          )}
          {device.dhcp && (
            <Section title={`DHCP Server · pool ${device.dhcp.start} – ${device.dhcp.end}`}>
              <Table
                head={["MAC klien", "IP yang dipinjamkan"]}
                rows={[...device.dhcp.leases.entries()].map(([mac, ip]) => [mac, ip])}
                empty="Belum ada klien yang meminta alamat IP."
              />
            </Section>
          )}
          {(device.nat.rules.length > 0 || device.nat.table.size > 0) && (
            <Section title={`NAT · masquerade keluar lewat ${device.nat.rules.map((r) => r.out).join(", ") || "-"}`}>
              <Table
                head={["Proto", "IP dalam", "→ IP publik", "Tujuan"]}
                rows={[...device.nat.table.values()]
                  .slice(-12)
                  .map((e) => [e.proto, `${e.insideIp}${e.port ? `:${e.port}` : ""}`, `${e.publicIp}${e.port ? `:${e.port}` : ""}`, `${e.remoteIp}${e.remotePort ? `:${e.remotePort}` : ""}`])}
                empty="Tabel translasi masih kosong."
              />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
