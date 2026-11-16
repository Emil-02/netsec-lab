import { inSubnet } from "./ip";
import type { ConnState, Device, Firewall, FwChain, FwRule, Packet } from "./types";

export function emptyFirewall(): Firewall {
  const chain = () => ({ policy: "ACCEPT" as const, rules: [], pkts: 0, bytes: 0 });
  return { chains: { INPUT: chain(), FORWARD: chain(), OUTPUT: chain() } };
}

export function packetSize(p: Packet): number {
  return 20 + (p.tcp ? 20 + (p.tcp.len ?? 0) : p.udp ? 8 + (p.app?.data?.length ?? 0) : 64);
}

function protoOf(p: Packet): "tcp" | "udp" | "icmp" | undefined {
  return p.tcp ? "tcp" : p.udp ? "udp" : p.icmp ? "icmp" : undefined;
}

function ports(p: Packet) {
  const l4 = p.tcp ?? p.udp;
  return { sport: l4?.srcPort, dport: l4?.dstPort };
}

function flowKey(proto: string, src: string, sport: number | string | undefined, dst: string, dport: number | string | undefined) {
  return `${proto}|${src}|${sport ?? "-"}|${dst}|${dport ?? "-"}`;
}

function keysOf(p: Packet): { fwd: string; rev: string } | null {
  const ip = p.ip;
  if (!ip) return null;
  const proto = protoOf(p);
  if (proto === "icmp") {
    const id = p.icmp!.orig ? p.icmp!.orig.id : p.icmp!.id;
    return { fwd: flowKey("icmp", ip.src, id, ip.dst, undefined), rev: flowKey("icmp", ip.dst, id, ip.src, undefined) };
  }
  const { sport, dport } = ports(p);
  return { fwd: flowKey(proto ?? "ip", ip.src, sport, ip.dst, dport), rev: flowKey(proto ?? "ip", ip.dst, dport, ip.src, sport) };
}

/** Simplified netfilter connection tracking state for `p` as seen by `device`. */
export function connState(device: Device, p: Packet): ConnState {
  const keys = keysOf(p);
  if (!keys) return "INVALID";
  const known = device.conntrack.has(keys.fwd) || device.conntrack.has(keys.rev);
  if (p.icmp) {
    if (p.icmp.type === 8) return known ? "ESTABLISHED" : "NEW";
    if (p.icmp.type === 0) return "ESTABLISHED";
    if (p.icmp.orig) {
      const o = p.icmp.orig;
      const origKey = flowKey(o.protocol.toLowerCase(), o.src, o.protocol === "ICMP" ? o.id : o.srcPort, o.dst, o.protocol === "ICMP" ? undefined : o.dstPort);
      return device.conntrack.has(origKey) ? "RELATED" : "INVALID";
    }
    return "NEW";
  }
  if (p.tcp) {
    const flags = p.tcp.flags.join("+");
    if (flags === "SYN") return known ? "ESTABLISHED" : "NEW";
    return known ? "ESTABLISHED" : "INVALID";
  }
  return known ? "ESTABLISHED" : "NEW";
}

function track(device: Device, p: Packet) {
  const keys = keysOf(p);
  if (!keys) return;
  if (device.conntrack.size > 4000) device.conntrack.clear();
  device.conntrack.add(keys.fwd);
}

function addrMatch(addr: FwRule["src"], ip: string) {
  return !addr || inSubnet(ip, addr.ip, addr.prefix);
}

export function ruleMatches(rule: FwRule, p: Packet, state: ConnState, inIface?: string, outIface?: string) {
  const ip = p.ip!;
  if (rule.proto && rule.proto !== protoOf(p)) return false;
  if (!addrMatch(rule.src, ip.src) || !addrMatch(rule.dst, ip.dst)) return false;
  const { sport, dport } = ports(p);
  if (rule.sport !== undefined && rule.sport !== sport) return false;
  if (rule.dport !== undefined && rule.dport !== dport) return false;
  if (rule.inIface && rule.inIface !== inIface) return false;
  if (rule.outIface && rule.outIface !== outIface) return false;
  if (rule.states && !rule.states.includes(state)) return false;
  return true;
}

export interface FilterVerdict {
  verdict: "ACCEPT" | "DROP" | "REJECT";
  rule?: FwRule;
  ruleIndex?: number;
  chain: FwChain;
  rejectWith?: FwRule["rejectWith"];
}

function logLine(device: Device, chain: FwChain, rule: FwRule, p: Packet, inIface?: string, outIface?: string) {
  const fs = device.fs;
  if (!fs) return;
  const ip = p.ip!;
  const { sport, dport } = ports(p);
  const proto = (protoOf(p) ?? "ip").toUpperCase();
  const line =
    `Nov 16 10:00:00 ${device.hostname} kernel: ${rule.logPrefix ?? ""}IN=${inIface ?? ""} OUT=${outIface ?? ""} ` +
    `SRC=${ip.src} DST=${ip.dst} TTL=${ip.ttl} PROTO=${proto}${sport !== undefined ? ` SPT=${sport} DPT=${dport}` : ""}` +
    `${p.tcp ? ` ${p.tcp.flags.join(" ")}` : ""}${p.icmp ? ` TYPE=${p.icmp.type} CODE=${p.icmp.code}` : ""} [${chain}]\n`;
  fs.mkdirp("/var/log", "root");
  fs.writeFile("/var/log/kern.log", line, "root", true);
}

/** Runs `p` through `chain` of `device`'s packet filter, updating counters and conntrack. */
export function filterPacket(device: Device, chain: FwChain, p: Packet, inIface?: string, outIface?: string): FilterVerdict {
  const c = device.firewall.chains[chain];
  const size = packetSize(p);
  if (!c.rules.length && c.policy === "ACCEPT") {
    track(device, p);
    return { verdict: "ACCEPT", chain };
  }
  const state = connState(device, p);
  for (let i = 0; i < c.rules.length; i++) {
    const rule = c.rules[i];
    if (!ruleMatches(rule, p, state, inIface, outIface)) continue;
    rule.pkts += 1;
    rule.bytes += size;
    if (rule.target === "LOG") {
      logLine(device, chain, rule, p, inIface, outIface);
      continue;
    }
    if (rule.target === "ACCEPT") track(device, p);
    return { verdict: rule.target, rule, ruleIndex: i, chain, rejectWith: rule.rejectWith };
  }
  c.pkts += 1;
  c.bytes += size;
  if (c.policy === "ACCEPT") track(device, p);
  return { verdict: c.policy, chain };
}

export function describeVerdict(v: FilterVerdict, device: Device) {
  const where = v.rule ? `aturan #${(v.ruleIndex ?? 0) + 1}` : `policy ${v.chain} = ${v.verdict}`;
  return `Diblokir firewall ${device.name} (iptables ${v.chain}: ${v.verdict}, ${where})`;
}
