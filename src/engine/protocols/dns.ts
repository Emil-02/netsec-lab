import { isValidIp } from "../core/ip";
import type { Network } from "../core/network";
import type { AppData, Device, DnsRecord, DnsRecordType } from "../core/types";
import { udpExchange } from "./transport";

export const DNS_TYPES: DnsRecordType[] = ["A", "CNAME", "MX", "TXT", "NS"];

export function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\.$/, "");
}

/** Nameservers from /etc/resolv.conf (or the device's built-in list when it has no filesystem). */
export function resolversOf(device: Device): string[] {
  const file = device.fs?.get("/etc/resolv.conf");
  if (!device.fs) return device.dnsServers;
  if (!file || file.type !== "file") return [];
  return file.content
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .filter(([key, value]) => key === "nameserver" && value && isValidIp(value))
    .map(([, value]) => value);
}

/** Looks up /etc/hosts (or the device's built-in table when it has no filesystem). */
export function hostsLookup(device: Device, name: string): string | null {
  const wanted = normalizeName(name);
  const file = device.fs?.get("/etc/hosts");
  if (file?.type === "file") {
    for (const line of file.content.split("\n")) {
      const [ip, ...names] = line.replace(/#.*/, "").trim().split(/\s+/);
      if (ip && isValidIp(ip) && names.some((n) => normalizeName(n) === wanted)) return ip;
    }
    return null;
  }
  const entry = Object.entries(device.hosts).find(([n]) => normalizeName(n) === wanted);
  return entry?.[1] ?? null;
}

function authoritative(records: DnsRecord[], name: string, type: DnsRecordType, depth = 0): DnsRecord[] | null {
  const matches = records.filter((r) => normalizeName(r.name) === name);
  if (!matches.length) return null;
  const direct = matches.filter((r) => r.type === type);
  if (direct.length) return direct;
  const cname = matches.find((r) => r.type === "CNAME");
  if (cname && depth < 5) return [cname, ...(authoritative(records, normalizeName(cname.value), type, depth + 1) ?? [])];
  return [];
}

export function formatRecord(r: DnsRecord) {
  const value = r.type === "TXT" ? `"${r.value}"` : r.type === "MX" ? `10 ${r.value}.` : r.type === "CNAME" || r.type === "NS" ? `${r.value}.` : r.value;
  return `${normalizeName(r.name)}.\t${r.ttl ?? 300}\tIN\t${r.type}\t${value}`;
}

let dnsId = 0x1a2b;

function queryApp(id: number, name: string, type: DnsRecordType): AppData {
  return {
    protocol: "DNS",
    summary: `Standard query 0x${id.toString(16)} ${type} ${name}`,
    data: `Pertanyaan: berapa record ${type} untuk "${name}"?`,
    dns: { id, response: false, name, type },
  };
}

function responseApp(id: number, name: string, type: DnsRecordType, status: "NOERROR" | "NXDOMAIN" | "SERVFAIL", answers: DnsRecord[]): AppData {
  const shown = answers.map((a) => `${a.type} ${a.value}`).join(", ");
  return {
    protocol: "DNS",
    summary: `Standard query response 0x${id.toString(16)} ${type} ${name}${status === "NOERROR" ? (shown ? ` → ${shown}` : " (tanpa jawaban)") : ` ${status}`}`,
    data: status === "NOERROR" ? (answers.map(formatRecord).join("\n") || "(tidak ada record)") : `Status: ${status}`,
    dns: { id, response: true, name, type, status, answers },
  };
}

/** How a DNS server answers a query arriving at time `t` (may forward to its upstream). */
function serve(net: Network, server: Device, name: string, type: DnsRecordType, id: number, t: number): { app: AppData; t: number } {
  const zone = server.dns;
  if (!zone) return { app: responseApp(id, name, type, "SERVFAIL", []), t };
  const local = authoritative(zone.records, name, type);
  if (local) return { app: responseApp(id, name, type, "NOERROR", local), t };
  if (zone.forwarder) {
    const upstream = udpExchange(net, t, server, zone.forwarder, 53, queryApp(id, name, type), (up, req, at) =>
      serve(net, up, name, type, req.app?.dns?.id ?? id, at),
    );
    if (upstream.status === "reply" && upstream.app.dns) {
      const d = upstream.app.dns;
      return { app: responseApp(id, name, type, d.status ?? "SERVFAIL", d.answers ?? []), t: upstream.t };
    }
    return { app: responseApp(id, name, type, "SERVFAIL", []), t: upstream.t };
  }
  return { app: responseApp(id, name, type, "NXDOMAIN", []), t };
}

export interface DnsQueryResult {
  status: "NOERROR" | "NXDOMAIN" | "SERVFAIL" | "timeout" | "refused" | "unreachable";
  answers: DnsRecord[];
  server: string;
  t: number;
}

export function dnsQuery(net: Network, t: number, client: Device, server: string, name: string, type: DnsRecordType = "A"): DnsQueryResult {
  dnsId = (dnsId + 0x1111) & 0xffff;
  const id = dnsId;
  const q = normalizeName(name);
  const res = udpExchange(net, t, client, server, 53, queryApp(id, q, type), (srv, _req, at) => serve(net, srv, q, type, id, at));
  if (res.status === "reply") {
    const d = res.app.dns!;
    return { status: d.status ?? "SERVFAIL", answers: d.answers ?? [], server, t: res.t };
  }
  if (res.status === "port-unreachable") return { status: "refused", answers: [], server, t: res.t };
  if (res.status === "unreachable") return { status: "unreachable", answers: [], server, t: res.t };
  return { status: "timeout", answers: [], server, t: res.t };
}

export type ResolveResult =
  | { ip: string; t: number; via: "literal" | "hosts" | "dns" }
  | { ip: null; t: number; error: "nxdomain" | "timeout" | "no-resolver" };

/** Name resolution as the C library does it: literal IP → /etc/hosts → DNS. */
export function resolveName(net: Network, t: number, device: Device, host: string): ResolveResult {
  if (isValidIp(host)) return { ip: host, t, via: "literal" };
  const name = normalizeName(host);
  if (name === "localhost") return { ip: "127.0.0.1", t, via: "hosts" };
  if (name === device.hostname) return { ip: device.interfaces.find((i) => i.ip)?.ip ?? "127.0.1.1", t, via: "hosts" };
  const fromHosts = hostsLookup(device, name);
  if (fromHosts) return { ip: fromHosts, t, via: "hosts" };

  const servers = resolversOf(device);
  if (!servers.length) return { ip: null, t, error: "no-resolver" };
  let time = t;
  for (const server of servers.slice(0, 3)) {
    const res = dnsQuery(net, time, device, server, name, "A");
    time = res.t;
    if (res.status === "NOERROR") {
      const a = res.answers.find((r) => r.type === "A");
      return a ? { ip: a.value, t: time, via: "dns" } : { ip: null, t: time, error: "nxdomain" };
    }
    if (res.status === "NXDOMAIN") return { ip: null, t: time, error: "nxdomain" };
  }
  return { ip: null, t: time, error: "timeout" };
}
