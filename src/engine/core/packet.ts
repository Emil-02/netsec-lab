import type { Packet, ProtocolName } from "./types";

export const BROADCAST_MAC = "ff:ff:ff:ff:ff:ff";
export const ZERO_MAC = "00:00:00:00:00:00";

export function packetProtocol(p: Packet): ProtocolName {
  if (p.app) return p.app.protocol;
  if (p.arp) return "ARP";
  if (p.icmp) return "ICMP";
  if (p.tcp) return "TCP";
  if (p.udp) return "UDP";
  return "IPv4";
}

export function packetSummary(p: Packet): string {
  if (p.app) return p.app.summary;
  if (p.arp) {
    return p.arp.op === "request"
      ? `Siapa yang punya ${p.arp.targetIp}? Beritahu ${p.arp.senderIp}`
      : `${p.arp.senderIp} ada di ${p.arp.senderMac}`;
  }
  if (p.icmp && p.ip) {
    const seq = p.icmp.seq !== undefined ? ` seq=${p.icmp.seq}` : "";
    return `${p.icmp.name} ${p.ip.src} → ${p.ip.dst}${seq} ttl=${p.ip.ttl}`;
  }
  if (p.tcp && p.ip) {
    return `${p.ip.src}:${p.tcp.srcPort} → ${p.ip.dst}:${p.tcp.dstPort} [${p.tcp.flags.join(", ")}]`;
  }
  if (p.udp && p.ip) {
    return `${p.ip.src}:${p.udp.srcPort} → ${p.ip.dst}:${p.udp.dstPort} UDP`;
  }
  if (p.ip) return `${p.ip.src} → ${p.ip.dst}`;
  return "Frame";
}

export const PROTOCOL_COLORS: Record<ProtocolName, string> = {
  ARP: "#f59e0b",
  ICMP: "#22d3ee",
  TCP: "#a78bfa",
  UDP: "#34d399",
  DNS: "#60a5fa",
  HTTP: "#f472b6",
  TLS: "#4ade80",
  DHCP: "#facc15",
  SSH: "#fb923c",
  IPv4: "#94a3b8",
};
