import { inSubnet, intToIp, ipToInt, isValidIp, parseCidr } from "../../core/ip";
import { HOP_MS, PROCESS_MS, type Network } from "../../core/network";
import { BROADCAST_MAC, ZERO_MAC } from "../../core/packet";
import type { Device, Packet } from "../../core/types";
import { echoRequest, deliveryFailure } from "../../protocols/icmp";
import { listeningService, tcpClose, tcpConnect, WELL_KNOWN_PORTS } from "../../protocols/transport";
import { ansi, type CommandContext, type CommandDef } from "../types";
import { resolveHost } from "./net";

/** Representative subset of nmap's default "top 1000" TCP ports. */
const TOP_TCP = new Set([
  7, 9, 13, 21, 22, 23, 25, 26, 37, 53, 79, 80, 81, 88, 106, 110, 111, 113, 119, 135, 139, 143, 144, 179, 199, 389, 427, 443, 444, 445, 465,
  513, 514, 515, 543, 544, 548, 554, 587, 631, 646, 873, 990, 993, 995, 1025, 1026, 1027, 1028, 1029, 1110, 1433, 1720, 1723, 1755, 1900,
  2000, 2001, 2049, 2121, 2222, 2717, 3000, 3128, 3306, 3389, 3986, 4899, 5000, 5009, 5051, 5060, 5101, 5190, 5357, 5432, 5631, 5666, 5800,
  5900, 6000, 6001, 6646, 7070, 8000, 8008, 8009, 8080, 8081, 8443, 8888, 9100, 9999, 10000, 32768, 49152, 49153, 49154, 49155, 49156,
  49157,
]);
const TOP_UDP = new Set([53, 67, 68, 69, 123, 135, 137, 138, 139, 161, 162, 445, 500, 514, 520, 631, 1434, 1900, 4500, 49152]);
const UDP_PROBED = new Set([53, 67, 123, 137, 161, 500, 1900]);
const DEFAULT_RANGE_SIZE = 1000;
const MAX_HOSTS = 256;

type PortState = "open" | "closed" | "filtered" | "open|filtered";

interface PortSpec {
  ports: number[] | null;
  size: number;
  label: string;
}

function parsePortSpec(spec: string | undefined): PortSpec | null {
  if (spec === undefined) return { ports: null, size: DEFAULT_RANGE_SIZE, label: "default" };
  if (spec === "-") return { ports: rangeList(1, 65535), size: 65535, label: "1-65535" };
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2] ?? m[1]);
    if (a < 1 || b > 65535 || b < a) return null;
    for (let p = a; p <= b; p++) out.add(p);
  }
  const ports = [...out].sort((x, y) => x - y);
  return { ports, size: ports.length, label: spec };
}

function rangeList(a: number, b: number) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

function inRange(spec: PortSpec, port: number, udp: boolean) {
  if (spec.ports) return spec.size === 65535 || spec.ports.includes(port);
  return (udp ? TOP_UDP : TOP_TCP).has(port);
}

export function expandTargets(ctx: CommandContext, specs: string[]): { ip: string; name?: string }[] | string {
  const out: { ip: string; name?: string }[] = [];
  for (const spec of specs) {
    const cidr = spec.includes("/") ? parseCidr(spec) : null;
    if (cidr) {
      if (cidr.prefix < 24) return `di lab ini rentang scan maksimal /24 (${MAX_HOSTS} alamat)`;
      const base = ipToInt(cidr.ip) & (cidr.prefix === 0 ? 0 : (0xffffffff << (32 - cidr.prefix)) >>> 0);
      const count = 2 ** (32 - cidr.prefix);
      for (let i = 0; i < count; i++) out.push({ ip: intToIp((base + i) >>> 0) });
      continue;
    }
    const range = /^(\d+\.\d+\.\d+\.)(\d+)-(\d+)$/.exec(spec);
    if (range) {
      for (let i = Number(range[2]); i <= Math.min(255, Number(range[3])); i++) out.push({ ip: `${range[1]}${i}` });
      continue;
    }
    if (isValidIp(spec)) {
      out.push({ ip: spec });
      continue;
    }
    const ip = resolveHost(ctx, spec);
    if (!ip) return `Failed to resolve "${spec}".`;
    out.push({ ip, name: spec });
  }
  if (out.length > MAX_HOSTS) return `terlalu banyak target (maksimal ${MAX_HOSTS})`;
  return out;
}

/** ARP "who-has" without using the cache, as nmap does on a local LAN. */
export function arpProbe(net: Network, t: number, device: Device, ip: string): { mac: string; t: number } | null {
  const iface = device.interfaces.find((i) => i.up && i.ip && i.prefix !== undefined && inSubnet(ip, i.ip, i.prefix));
  if (!iface?.ip) return null;
  const request: Packet = {
    id: net.nextPacketId(),
    eth: { src: iface.mac, dst: BROADCAST_MAC, type: "ARP" },
    arp: { op: "request", senderMac: iface.mac, senderIp: iface.ip, targetMac: ZERO_MAC, targetIp: ip },
  };
  const owner = net.transmitFrame(t, device, iface.name, request).find((a) => a.device.interfaces.some((i) => i.name === a.iface && i.ip === ip && i.up));
  if (!owner) return null;
  const ownerIface = owner.device.interfaces.find((i) => i.name === owner.iface)!;
  owner.device.arp.set(iface.ip, { mac: iface.mac, iface: owner.iface });
  const reply: Packet = {
    id: net.nextPacketId(),
    eth: { src: ownerIface.mac, dst: iface.mac, type: "ARP" },
    arp: { op: "reply", senderMac: ownerIface.mac, senderIp: ip, targetMac: iface.mac, targetIp: iface.ip },
  };
  const back = net.transmitFrame(owner.t + PROCESS_MS, owner.device, owner.iface, reply).find((a) => a.device.id === device.id);
  if (!back) return null;
  device.arp.set(ip, { mac: ownerIface.mac, iface: iface.name });
  net.enforcePoison();
  return { mac: ownerIface.mac, t: back.t };
}

function isLocal(device: Device, ip: string) {
  return device.interfaces.some((i) => i.up && i.ip && i.prefix !== undefined && inSubnet(ip, i.ip, i.prefix));
}

interface HostResult {
  ip: string;
  name?: string;
  up: boolean;
  mac?: string;
  t: number;
}

function discover(ctx: CommandContext, target: { ip: string; name?: string }, t: number, root: boolean): HostResult {
  const { net, device } = ctx;
  if (device.interfaces.some((i) => i.ip === target.ip)) return { ...target, up: true, t };
  if (root && isLocal(device, target.ip)) {
    const r = arpProbe(net, t, device, target.ip);
    return r ? { ...target, up: true, mac: r.mac, t: r.t } : { ...target, up: false, t: t + HOP_MS * 4 };
  }
  if (root) {
    const r = echoRequest(net, t, device, net.sourceIpFor(device, target.ip) ?? "0.0.0.0", target.ip, 0, 64, net.nextIcmpId());
    if (r.kind === "reply") return { ...target, up: true, t: r.t };
  }
  for (const port of [80, 443]) {
    const r = tcpConnect(net, t, device, target.ip, port);
    if (r.status === "open") {
      tcpClose(net, r.conn);
      return { ...target, up: true, t: r.conn.t };
    }
    if (r.status === "refused" && !r.byFirewall) return { ...target, up: true, t: r.t };
    t = r.t;
  }
  return { ...target, up: false, t };
}

function sendRaw(net: Network, t: number, from: Device, src: string, dst: string, tcp: NonNullable<Packet["tcp"]>) {
  return net.sendIp(t, from, { id: net.nextPacketId(), ip: { src, dst, ttl: 64, protocol: "TCP" }, tcp });
}

/** One TCP SYN (half-open) probe. */
function synProbe(net: Network, t: number, scanner: Device, dst: string, port: number): { state: PortState; t: number } {
  const src = net.sourceIpFor(scanner, dst);
  if (!src) return { state: "filtered", t };
  const sport = net.nextPort();
  const out = sendRaw(net, t, scanner, src, dst, { srcPort: sport, dstPort: port, flags: ["SYN"], seq: 0, len: 0 });
  if (out.status === "delivered") {
    const target = out.device;
    const seen = out.packet.ip!;
    const open = !!listeningService(target, "tcp", port, seen.dst);
    const back = sendRaw(net, out.t + PROCESS_MS, target, seen.dst, seen.src, {
      srcPort: port,
      dstPort: out.packet.tcp!.srcPort,
      flags: open ? ["SYN", "ACK"] : ["RST", "ACK"],
      seq: 0,
      ack: 1,
      len: 0,
    });
    if (back.status !== "delivered") return { state: "filtered", t: back.t + HOP_MS };
    if (open) sendRaw(net, back.t + 20, scanner, src, dst, { srcPort: sport, dstPort: port, flags: ["RST"], seq: 1, len: 0 });
    return { state: open ? "open" : "closed", t: back.t };
  }
  const f = deliveryFailure(net, out, scanner);
  return { state: f.kind === "refused" ? "closed" : "filtered", t: f.t };
}

function connectProbe(net: Network, t: number, scanner: Device, dst: string, port: number): { state: PortState; t: number } {
  const r = tcpConnect(net, t, scanner, dst, port);
  if (r.status === "open") {
    const c = r.conn;
    sendRaw(net, c.t + 20, scanner, c.clientIp, c.serverIp, { srcPort: c.clientPort, dstPort: port, flags: ["RST", "ACK"], seq: c.cSeq, ack: c.sSeq, len: 0 });
    return { state: "open", t: c.t };
  }
  if (r.status === "refused") return { state: r.byFirewall ? "filtered" : "closed", t: r.t };
  return { state: "filtered", t: r.t };
}

function udpProbe(net: Network, t: number, scanner: Device, dst: string, port: number): { state: PortState; t: number } {
  const src = net.sourceIpFor(scanner, dst);
  if (!src) return { state: "open|filtered", t };
  const out = net.sendIp(t, scanner, {
    id: net.nextPacketId(),
    ip: { src, dst, ttl: 64, protocol: "UDP" },
    udp: { srcPort: net.nextPort(), dstPort: port },
  });
  if (out.status === "delivered") {
    if (listeningService(out.device, "udp", port, out.packet.ip!.dst)) {
      // nmap sends protocol-specific payloads to these ports and gets a reply; other services stay silent.
      return { state: UDP_PROBED.has(port) ? "open" : "open|filtered", t: out.t + HOP_MS };
    }
    const back = net.sendIp(out.t + PROCESS_MS, out.device, {
      id: net.nextPacketId(),
      ip: { src: out.packet.ip!.dst, dst: out.packet.ip!.src, ttl: 64, protocol: "ICMP" },
      icmp: { type: 3, code: 3, name: "Destination Port Unreachable", orig: { src: out.packet.ip!.src, dst: out.packet.ip!.dst, protocol: "UDP", srcPort: out.packet.udp!.srcPort, dstPort: port } },
    });
    return { state: back.status === "delivered" ? "closed" : "open|filtered", t: back.t };
  }
  const f = deliveryFailure(net, out, scanner);
  return { state: f.kind === "unreachable" && f.reason === "port" ? "closed" : "open|filtered", t: f.t };
}

function serviceName(port: number, udp: boolean) {
  if (udp && port === 123) return "ntp";
  return WELL_KNOWN_PORTS[port] ?? "unknown";
}

function versionOf(target: Device, port: number) {
  const svc = target.services.find((s) => s.port === port && s.protocol === "tcp");
  if (!svc) return "";
  if (svc.version) return svc.version;
  if ((svc.name === "http" || svc.name === "https") && target.web?.software) return target.web.software.replace("/", " ");
  return svc.banner ?? "";
}

function nmap(ctx: CommandContext): number {
  const args = ctx.args;
  const root = ctx.isRoot();
  const pingOnly = args.includes("-sn");
  const udp = args.includes("-sU");
  const all = args.includes("-A");
  const versions = all || args.includes("-sV");
  const os = all || args.includes("-O");
  const skipPing = args.includes("-Pn");
  const openOnly = args.includes("--open");
  let scanType: "syn" | "connect" = root ? "syn" : "connect";
  if (args.includes("-sT")) scanType = "connect";
  if (args.includes("-sS")) {
    if (!root) {
      ctx.error("You requested a scan type which requires root privileges.\nQUITTING!");
      ctx.print(ansi.yellow("Petunjuk: SYN scan (-sS) mengirim paket mentah, jadi butuh sudo."));
      return 1;
    }
    scanType = "syn";
  }
  if ((udp || os) && !root) {
    ctx.error(`${udp ? "UDP scan (-sU)" : "OS detection (-O)"} requires root privileges.\nQUITTING!`);
    return 1;
  }

  const pIdx = args.findIndex((a) => a === "-p" || (a.startsWith("-p") && a.length > 2 && !a.startsWith("-Pn")));
  const pRaw = pIdx < 0 ? undefined : args[pIdx] === "-p" ? args[pIdx + 1] : args[pIdx].slice(2);
  const spec = parsePortSpec(pRaw);
  if (!spec) {
    ctx.error(`Error #485: Your port specifications are illegal. Example of proper form: "-100,200-1024,T:3000-4000,U:60000-"`);
    return 1;
  }
  const valueFlags = new Set(["-p", "-T", "--top-ports", "-oN", "-e"]);
  const targets = args.filter((a, i) => !a.startsWith("-") && !(i > 0 && valueFlags.has(args[i - 1])));
  if (!targets.length) {
    ctx.print("Nmap 7.94SVN ( https://nmap.org )");
    ctx.print("Penggunaan: nmap [opsi] <target>");
    ctx.print("  -sn            hanya cari host yang hidup (tanpa port scan)");
    ctx.print("  -sS / -sT / -sU  SYN scan (butuh sudo) / connect scan / UDP scan (butuh sudo)");
    ctx.print("  -p 22,80 | -p 1-1000 | -p-   pilih port (-p- = semua port)");
    ctx.print("  -sV  deteksi versi layanan   -O  deteksi OS (sudo)   -A  agresif   -Pn  lewati host discovery");
    return 0;
  }
  const expanded = expandTargets(ctx, targets);
  if (typeof expanded === "string") {
    ctx.error(`nmap: ${expanded}`);
    return 1;
  }

  ctx.print(`Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-11-16 10:00 WIB`);
  ctx.fact("nmap:run");
  const start = ctx.t;
  let upCount = 0;

  // Host discovery runs in parallel; probes are staggered a few ms apart.
  const hosts: HostResult[] = expanded.map((target, i) =>
    skipPing ? { ...target, up: true, t: start } : discover(ctx, target, start + i * 12, root),
  );
  let cursor = hosts.reduce((m, h) => Math.max(m, h.t), start);

  for (const host of hosts) {
    if (!host.up) continue;
    upCount += 1;
    ctx.fact(`nmap:host-up:${host.ip}`);
    ctx.t = cursor;
    const label = host.name ? `${host.name} (${host.ip})` : host.ip;
    ctx.print(`Nmap scan report for ${label}`);
    const target = ctx.net.findDeviceByIp(host.ip)?.device;
    if (pingOnly) {
      ctx.print(`Host is up (0.000${(ipToInt(host.ip) % 90) + 10}s latency).`);
      if (host.mac) ctx.print(`MAC Address: ${host.mac.toUpperCase()} (Unknown)`);
      continue;
    }

    // Probe every port that might be interesting plus one representative "other" port.
    const proto = udp ? "udp" : "tcp";
    const interesting = new Set<number>();
    for (const s of target?.services ?? []) if (s.protocol === proto && inRange(spec, s.port, udp)) interesting.add(s.port);
    const sampleSource = spec.ports && spec.size <= 30 ? spec.ports : [...(udp ? TOP_UDP : TOP_TCP)].filter((p) => inRange(spec, p, udp));
    for (const p of sampleSource.slice(0, 12)) interesting.add(p);
    if (spec.ports && spec.size <= 30) spec.ports.forEach((p) => interesting.add(p));
    const probes = [...interesting].sort((a, b) => a - b);
    const states = new Map<number, PortState>();
    let end = cursor;
    probes.forEach((port, i) => {
      const at = cursor + i * 25;
      const r = udp ? udpProbe(ctx.net, at, ctx.device, host.ip, port) : scanType === "syn" ? synProbe(ctx.net, at, ctx.device, host.ip, port) : connectProbe(ctx.net, at, ctx.device, host.ip, port);
      states.set(port, r.state);
      end = Math.max(end, r.t);
    });
    // The state of every port we did not probe individually.
    const other = probes.find((p) => !target?.services.some((s) => s.port === p && s.protocol === proto));
    const restState: PortState = other !== undefined ? states.get(other)! : "closed";
    const counts = new Map<PortState, number>();
    for (const st of states.values()) counts.set(st, (counts.get(st) ?? 0) + 1);
    counts.set(restState, (counts.get(restState) ?? 0) + Math.max(0, spec.size - probes.length));
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const hide = spec.size > 25 ? dominant : null;
    ctx.t = end;
    cursor = end + 50;

    ctx.print(`Host is up (0.000${(ipToInt(host.ip) % 90) + 10}s latency).`);
    if (hide && (counts.get(hide) ?? 0) > 0) {
      const why = hide === "closed" ? (udp ? "(port-unreach)" : "(reset)") : "(no-response)";
      ctx.print(`Not shown: ${counts.get(hide)} ${hide} ${proto} ports ${why}`);
    }
    const rows = probes.filter((p) => states.get(p) !== hide && (!openOnly || states.get(p) === "open"));
    if (!rows.length && hide) {
      ctx.print(`All ${spec.size} scanned ports on ${label} are in ignored states.`);
    } else {
      const showVersion = versions && rows.some((p) => states.get(p) === "open");
      ctx.print(ansi.bold(`${"PORT".padEnd(10)}${"STATE".padEnd(14)}${"SERVICE".padEnd(14)}${showVersion ? "VERSION" : ""}`));
      for (const port of rows) {
        const st = states.get(port)!;
        const svc = target?.services.find((s) => s.port === port && s.protocol === proto);
        const name = svc && st === "open" ? (WELL_KNOWN_PORTS[port] ?? svc.name) : serviceName(port, udp);
        const version = showVersion && st === "open" && target ? versionOf(target, port) : "";
        const stateText = st === "open" ? ansi.green(st.padEnd(14)) : st === "filtered" ? ansi.yellow(st.padEnd(14)) : st.padEnd(14);
        ctx.print(`${`${port}/${proto}`.padEnd(10)}${stateText}${name.padEnd(14)}${version}`);
        ctx.fact(`nmap:${st}:${host.ip}:${port}`);
        if (version) ctx.fact(`nmap:version:${host.ip}:${port}`);
      }
      if (versions && target) {
        // Version probes run in parallel, like nmap's service scan.
        const begin = ctx.t;
        rows
          .filter((p) => states.get(p) === "open")
          .forEach((port, i) => {
            const r = tcpConnect(ctx.net, begin + i * 30, ctx.device, host.ip, port);
            if (r.status === "open") {
              tcpClose(ctx.net, r.conn);
              ctx.t = Math.max(ctx.t, r.conn.t);
            }
          });
        cursor = ctx.t + 50;
      }
    }
    if (host.mac) ctx.print(`MAC Address: ${host.mac.toUpperCase()} (Unknown)`);
    if (os) {
      if (target?.os) {
        ctx.print(`Running: ${target.os.split(" ")[0]}`);
        ctx.print(`OS details: ${target.os}`);
        ctx.fact(`nmap:os:${host.ip}`);
      } else ctx.print("No exact OS matches for host (test conditions non-ideal).");
      ctx.print(`Network Distance: ${host.mac ? 1 : 2} hop${host.mac ? "" : "s"}`);
    }
    if (versions && rows.some((p) => states.get(p) === "open" && p === 22)) ctx.print("Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel");
    ctx.print("");
    ctx.fact(`nmap:scanned:${host.ip}`);
    if (spec.size === 65535) ctx.fact(`nmap:allports:${host.ip}`);
  }

  const total = expanded.length;
  ctx.t = Math.max(ctx.t, cursor);
  const secs = ((ctx.t - start) / 1000 + 0.21).toFixed(2);
  if (upCount === 0 && !skipPing) ctx.print("Note: Host seems down. If it is really up, but blocking our ping probes, try -Pn");
  ctx.print(`Nmap done: ${total} IP address${total > 1 ? "es" : ""} (${upCount} host${upCount === 1 ? "" : "s"} up) scanned in ${secs} seconds`);
  if (pingOnly) ctx.fact("nmap:sn");
  if (!root && !pingOnly && !udp) ctx.fact("nmap:connect-scan");
  if (scanType === "syn" && root && !pingOnly && !udp) ctx.fact("nmap:syn-scan");
  if (udp) ctx.fact("nmap:udp-scan");
  return 0;
}

export const nmapCommand: CommandDef = {
  name: "nmap",
  category: "keamanan",
  summary: "Network mapper: mencari host yang hidup dan port yang terbuka",
  usage: "nmap [-sn] [-sS|-sT|-sU] [-sV] [-O] [-A] [-Pn] [-p port] <target>",
  run: nmap,
};
