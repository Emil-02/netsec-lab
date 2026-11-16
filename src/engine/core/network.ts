import { inSubnet, ipToInt, networkAddress } from "./ip";
import { BROADCAST_MAC, ZERO_MAC } from "./packet";
import { describeVerdict, filterPacket, type FilterVerdict } from "./firewall";
import type { Device, FwChain, HopEvent, Link, NatEntry, NetInterface, Packet, SimEvent } from "./types";

/** Simulated time (ms) for a frame to cross one link. */
export const HOP_MS = 450;
/** Simulated time (ms) a device spends processing before replying. */
export const PROCESS_MS = 120;
export const ARP_TIMEOUT_MS = 1500;

export interface Arrival {
  device: Device;
  iface: string;
  t: number;
  hopId: string;
}

export interface CapturedFrame {
  t: number;
  iface: string;
  direction: "in" | "out";
  packet: Packet;
}

export interface CaptureSession {
  iface: string;
  promisc: boolean;
  frames: CapturedFrame[];
}

export interface ArpPoison {
  victim: string;
  ip: string;
  mac: string;
  iface: string;
  /** Device running the spoofing tool (used to stop it). */
  by: string;
}

export interface RouteDecision {
  iface: string;
  nextHop: string;
}

/** `iface` is the interface the packet arrived on (null when the failure happened at the origin). */
export type IpOutcome =
  | { status: "delivered"; device: Device; iface: string; t: number; packet: Packet; hops: number }
  | { status: "no-route"; device: Device; iface: string | null; t: number; packet: Packet; hops: number }
  | { status: "arp-failed"; device: Device; iface: string | null; t: number; nextHop: string; packet: Packet; hops: number }
  | { status: "ttl-exceeded"; device: Device; iface: string; t: number; packet: Packet; hops: number }
  | { status: "dropped"; device: Device; t: number; reason: string; hops: number; verdict?: FilterVerdict }
  | { status: "rejected"; device: Device; t: number; hops: number; verdict: FilterVerdict; back: IpOutcome | null };

function natKey(proto: string, port: number | undefined, remoteIp: string, remotePort: number | undefined) {
  return `${proto}|${port ?? "-"}|${remoteIp}|${remotePort ?? "-"}`;
}

export class Network {
  devices = new Map<string, Device>();
  links: Link[] = [];
  events: SimEvent[] = [];
  private packetSeq = 0;
  private eventSeq = 0;
  private portSeq = 51234;
  captures = new Map<string, CaptureSession>();
  poisons: ArpPoison[] = [];
  private icmpSeq = 0x2a00;

  addDevice(device: Device) {
    this.devices.set(device.id, device);
  }

  addLink(link: Link) {
    this.links.push(link);
  }

  device(id: string): Device {
    const d = this.devices.get(id);
    if (!d) throw new Error(`Unknown device: ${id}`);
    return d;
  }

  nextPacketId(): string {
    this.packetSeq += 1;
    return `pkt-${this.packetSeq}`;
  }

  /** Ephemeral (client-side) port for a new TCP/UDP conversation. */
  nextPort(): number {
    this.portSeq = this.portSeq >= 60999 ? 51234 : this.portSeq + 1;
    return this.portSeq;
  }

  nextIcmpId(): number {
    this.icmpSeq += 1;
    return this.icmpSeq;
  }

  /** Starts a fresh recording for one command. */
  beginRecording() {
    this.events = [];
  }

  output(at: number, text: string) {
    this.events.push({ kind: "output", at, text });
  }

  showPage(at: number, page: { url: string; status: number; html: string; scripts: string[] }) {
    this.events.push({ kind: "browser", at, ...page });
  }

  private hop(event: Omit<HopEvent, "kind" | "id">): string {
    this.eventSeq += 1;
    const id = `ev-${this.eventSeq}`;
    this.events.push({ kind: "hop", id, ...event });
    return id;
  }

  /** Marks an already-recorded hop as dropped (e.g. by a firewall after arrival). */
  markDropped(hopId: string, note: string) {
    const ev = this.events.find((e) => e.kind === "hop" && e.id === hopId) as HopEvent | undefined;
    if (ev) {
      ev.dropped = true;
      ev.note = note;
    }
  }

  private capture(device: Device, iface: string, t: number, direction: "in" | "out", packet: Packet) {
    const cap = this.captures.get(device.id);
    if (cap && (cap.iface === "any" || cap.iface === iface)) cap.frames.push({ t, iface, direction, packet });
  }

  /** Re-applies active ARP spoofing so that legitimate ARP traffic cannot heal a poisoned cache. */
  enforcePoison() {
    for (const p of this.poisons) {
      const victim = this.devices.get(p.victim);
      if (victim && !victim.arp.get(p.ip)?.static) victim.arp.set(p.ip, { mac: p.mac, iface: p.iface });
    }
  }

  // ---------- topology helpers ----------

  linkAt(deviceId: string, iface: string): { link: Link; peer: { device: string; iface: string } } | null {
    for (const link of this.links) {
      if (link.a.device === deviceId && link.a.iface === iface) return { link, peer: link.b };
      if (link.b.device === deviceId && link.b.iface === iface) return { link, peer: link.a };
    }
    return null;
  }

  findDeviceByIp(ip: string): { device: Device; iface: NetInterface } | null {
    for (const device of this.devices.values()) {
      const iface = device.interfaces.find((i) => i.ip === ip && i.up);
      if (iface) return { device, iface };
    }
    return null;
  }

  ownsIp(device: Device, ip: string): boolean {
    return ip.startsWith("127.") || device.interfaces.some((i) => i.ip === ip && i.up);
  }

  isSwitching(device: Device) {
    return device.kind === "switch" || device.kind === "hub";
  }

  // ---------- Layer 3: routing ----------

  lookupRoute(device: Device, dst: string): RouteDecision | null {
    let best: (RouteDecision & { prefix: number }) | null = null;
    const consider = (candidate: RouteDecision & { prefix: number }) => {
      if (!best || candidate.prefix > best.prefix) best = candidate;
    };
    for (const iface of device.interfaces) {
      if (!iface.up || !iface.ip || iface.prefix === undefined) continue;
      if (inSubnet(dst, iface.ip, iface.prefix)) {
        consider({ iface: iface.name, nextHop: dst, prefix: iface.prefix });
      }
    }
    for (const route of device.routes) {
      if (!inSubnet(dst, route.network, route.prefix)) continue;
      const egress = device.interfaces.find(
        (i) => i.up && i.ip && i.prefix !== undefined && inSubnet(route.via, i.ip, i.prefix),
      );
      if (egress) consider({ iface: egress.name, nextHop: route.via, prefix: route.prefix });
    }
    return best;
  }

  connectedRoutes(device: Device) {
    return device.interfaces
      .filter((i) => i.up && i.ip && i.prefix !== undefined)
      .map((i) => ({ network: networkAddress(i.ip!, i.prefix!), prefix: i.prefix!, iface: i.name, src: i.ip! }));
  }

  // ---------- Layer 2: frame delivery ----------

  /**
   * Transmits a frame out of `iface`, walking through switches/hubs and
   * returning every endpoint NIC that accepted the frame.
   */
  transmitFrame(t: number, from: Device, iface: string, frame: Packet, visited = new Set<string>()): Arrival[] {
    const conn = this.linkAt(from.id, iface);
    const sourceIface = from.interfaces.find((i) => i.name === iface);
    if (!conn || !sourceIface?.up || visited.has(conn.link.id)) return [];
    visited.add(conn.link.id);

    const peer = this.device(conn.peer.device);
    const peerIface = peer.interfaces.find((i) => i.name === conn.peer.iface);
    const arriveAt = t + HOP_MS;
    const dstMac = frame.eth?.dst ?? BROADCAST_MAC;
    if (!this.isSwitching(from)) this.capture(from, iface, t, "out", frame);

    if (!peerIface?.up) {
      this.hop({ at: t, duration: HOP_MS, linkId: conn.link.id, from: from.id, to: peer.id, packet: frame, dropped: true, note: "Interface tujuan mati (down)" });
      return [];
    }

    if (this.isSwitching(peer)) {
      this.hop({ at: t, duration: HOP_MS, linkId: conn.link.id, from: from.id, to: peer.id, packet: frame });
      if (peer.kind === "hub") {
        return peer.interfaces
          .filter((i) => i.name !== peerIface.name)
          .flatMap((i) => this.transmitFrame(arriveAt, peer, i.name, frame, visited));
      }
      const vlan = peerIface.trunk ? (frame.eth?.vlan ?? 1) : (peerIface.vlan ?? 1);
      if (frame.eth) peer.macTable.set(`${vlan}|${frame.eth.src}`, { mac: frame.eth.src, port: peerIface.name, vlan });
      const known = dstMac !== BROADCAST_MAC ? peer.macTable.get(`${vlan}|${dstMac}`) : undefined;
      const outPorts = known
        ? peer.interfaces.filter((i) => i.name === known.port && i.name !== peerIface.name)
        : peer.interfaces.filter((i) => i.name !== peerIface.name && (i.trunk || (i.vlan ?? 1) === vlan));
      return outPorts.flatMap((port) => {
        const tag = port.trunk && vlan !== 1 ? vlan : undefined;
        const out: Packet = frame.eth ? { ...frame, eth: { ...frame.eth, vlan: tag } } : frame;
        return this.transmitFrame(arriveAt, peer, port.name, out, visited);
      });
    }

    const accepts = dstMac === BROADCAST_MAC || dstMac === peerIface.mac;
    const cap = this.captures.get(peer.id);
    if (accepts || cap?.promisc) this.capture(peer, peerIface.name, arriveAt, "in", frame);
    const hopId = this.hop({
      at: t,
      duration: HOP_MS,
      linkId: conn.link.id,
      from: from.id,
      to: peer.id,
      packet: frame,
      ignored: !accepts,
      note: accepts ? undefined : "MAC tujuan bukan milik perangkat ini, frame diabaikan",
    });
    return accepts ? [{ device: peer, iface: peerIface.name, t: arriveAt, hopId }] : [];
  }

  // ---------- ARP ----------

  resolveMac(device: Device, ifaceName: string, ip: string, t: number): { mac: string; t: number } | null {
    const cached = device.arp.get(ip);
    if (cached) return { mac: cached.mac, t };
    const iface = device.interfaces.find((i) => i.name === ifaceName);
    if (!iface?.ip) return null;

    const request: Packet = {
      id: this.nextPacketId(),
      eth: { src: iface.mac, dst: BROADCAST_MAC, type: "ARP" },
      arp: { op: "request", senderMac: iface.mac, senderIp: iface.ip, targetMac: ZERO_MAC, targetIp: ip },
    };
    const arrivals = this.transmitFrame(t, device, ifaceName, request);
    const owner = arrivals.find((a) => a.device.interfaces.some((i) => i.name === a.iface && i.ip === ip && i.up));
    if (!owner) return null;

    if (!owner.device.arp.get(iface.ip)?.static) owner.device.arp.set(iface.ip, { mac: iface.mac, iface: owner.iface });
    const ownerIface = owner.device.interfaces.find((i) => i.name === owner.iface)!;
    const reply: Packet = {
      id: this.nextPacketId(),
      eth: { src: ownerIface.mac, dst: iface.mac, type: "ARP" },
      arp: { op: "reply", senderMac: ownerIface.mac, senderIp: ip, targetMac: iface.mac, targetIp: iface.ip },
    };
    const back = this.transmitFrame(owner.t + PROCESS_MS, owner.device, owner.iface, reply);
    const received = back.find((a) => a.device.id === device.id);
    this.enforcePoison();
    if (!received) return null;
    if (!device.arp.get(ip)?.static) device.arp.set(ip, { mac: ownerIface.mac, iface: ifaceName });
    this.enforcePoison();
    return { mac: device.arp.get(ip)!.mac, t: received.t };
  }

  // ---------- IP delivery ----------

  /** Sends an IP packet from `origin`, hop by hop, until it is delivered or dropped. */
  sendIp(t: number, origin: Device, packet: Packet): IpOutcome {
    if (!packet.ip) throw new Error("sendIp requires an IP header");
    let current = origin;
    let pkt = packet;
    let time = t;
    let hops = 0;
    let ingress: string | null = null;

    if (this.ownsIp(origin, pkt.ip!.dst)) {
      return { status: "delivered", device: origin, iface: "lo", t: time, packet: pkt, hops };
    }

    const firstRoute = this.lookupRoute(origin, pkt.ip!.dst);
    const out = filterPacket(origin, "OUTPUT", pkt, undefined, firstRoute?.iface);
    if (out.verdict !== "ACCEPT") {
      return { status: "dropped", device: origin, t: time, reason: "firewall", hops, verdict: out };
    }

    for (let guard = 0; guard < 32; guard++) {
      const route = this.lookupRoute(current, pkt.ip!.dst);
      if (!route) return { status: "no-route", device: current, iface: ingress, t: time, packet: pkt, hops };

      if (current.nat.rules.some((r) => r.out === route.iface) && !this.ownsIp(current, pkt.ip!.src)) {
        pkt = this.snat(current, route.iface, pkt);
      }

      const resolved = this.resolveMac(current, route.iface, route.nextHop, time);
      if (!resolved) {
        return { status: "arp-failed", device: current, iface: ingress, t: time + ARP_TIMEOUT_MS, nextHop: route.nextHop, packet: pkt, hops };
      }
      time = resolved.t;
      const egress = current.interfaces.find((i) => i.name === route.iface)!;
      const frame: Packet = { ...pkt, eth: { src: egress.mac, dst: resolved.mac, type: "IPv4" } };
      const arrival = this.transmitFrame(time, current, route.iface, frame).find((a) =>
        a.device.interfaces.some((i) => i.name === a.iface && i.mac === resolved.mac),
      );
      if (!arrival) return { status: "dropped", device: current, t: time, reason: "link", hops };

      hops += 1;
      time = arrival.t;
      const next = arrival.device;
      const translated = this.dnat(next, arrival.iface, frame);
      if (!translated && this.ownsIp(next, frame.ip!.dst)) {
        const verdict = filterPacket(next, "INPUT", frame, arrival.iface);
        if (verdict.verdict !== "ACCEPT") return this.blocked(next, arrival, frame, verdict, hops);
        return { status: "delivered", device: next, iface: arrival.iface, t: time, packet: frame, hops };
      }
      if (!next.forwarding) {
        return { status: "dropped", device: next, t: time, reason: "not-forwarding", hops };
      }
      const inbound = translated ?? frame;
      const ttl = inbound.ip!.ttl - 1;
      if (ttl <= 0) {
        return { status: "ttl-exceeded", device: next, iface: arrival.iface, t: time, packet: frame, hops };
      }
      const fwdRoute = this.lookupRoute(next, inbound.ip!.dst);
      const verdict = filterPacket(next, "FORWARD", inbound, arrival.iface, fwdRoute?.iface);
      if (verdict.verdict !== "ACCEPT") return this.blocked(next, arrival, inbound, verdict, hops);
      pkt = {
        ...inbound,
        id: this.nextPacketId(),
        eth: undefined,
        ip: { ...inbound.ip!, ttl },
        note: translated ? inbound.note : undefined,
      };
      current = next;
      ingress = arrival.iface;
      time += PROCESS_MS / 2;
    }
    return { status: "dropped", device: current, t: time, reason: "loop", hops };
  }

  /** A packet filter refused `pkt` at `device`: drop silently, or send a REJECT response. */
  private blocked(device: Device, arrival: Arrival, pkt: Packet, verdict: FilterVerdict, hops: number): IpOutcome {
    this.markDropped(arrival.hopId, describeVerdict(verdict, device));
    if (verdict.verdict === "DROP") {
      return { status: "dropped", device, t: arrival.t, reason: "firewall", hops, verdict };
    }
    const ip = pkt.ip!;
    const fromIp = this.ownsIp(device, ip.dst) ? ip.dst : (device.interfaces.find((i) => i.name === arrival.iface)?.ip ?? ip.dst);
    let response: Packet;
    if (verdict.rejectWith === "tcp-reset" && pkt.tcp) {
      response = {
        id: this.nextPacketId(),
        ip: { src: ip.dst, dst: ip.src, ttl: 64, protocol: "TCP" },
        tcp: { srcPort: pkt.tcp.dstPort, dstPort: pkt.tcp.srcPort, flags: ["RST", "ACK"], seq: 0, ack: (pkt.tcp.seq ?? 0) + 1, len: 0 },
        note: `Ditolak firewall ${device.name} (REJECT --reject-with tcp-reset)`,
      };
    } else {
      const l4 = pkt.tcp ?? pkt.udp;
      response = {
        id: this.nextPacketId(),
        ip: { src: fromIp, dst: ip.src, ttl: 64, protocol: "ICMP" },
        icmp: {
          type: 3,
          code: 3,
          name: "Destination Port Unreachable",
          seq: pkt.icmp?.seq,
          id: pkt.icmp?.id,
          orig: { src: ip.src, dst: ip.dst, protocol: ip.protocol, srcPort: l4?.srcPort, dstPort: l4?.dstPort, id: pkt.icmp?.id },
        },
        note: `Ditolak firewall ${device.name} (iptables REJECT)`,
      };
    }
    const back = this.sendIp(arrival.t + PROCESS_MS, device, response);
    return { status: "rejected", device, t: back.t, hops, verdict, back };
  }

  /** Runs the local filter of `device` on a packet it originates outside of sendIp (e.g. raw tools). */
  allows(device: Device, chain: FwChain, pkt: Packet, inIface?: string) {
    return filterPacket(device, chain, pkt, inIface).verdict === "ACCEPT";
  }

  // ---------- NAT (masquerade) ----------

  private snat(router: Device, outIface: string, pkt: Packet): Packet {
    const publicIp = router.interfaces.find((i) => i.name === outIface)?.ip;
    const ip = pkt.ip!;
    if (!publicIp) return pkt;
    const l4 = pkt.tcp ?? pkt.udp;
    let key: string | null = null;
    let entry: NatEntry | null = null;
    if (l4) {
      const proto = pkt.tcp ? "TCP" : "UDP";
      key = natKey(proto, l4.srcPort, ip.dst, l4.dstPort);
      entry = { proto, insideIp: ip.src, publicIp, remoteIp: ip.dst, port: l4.srcPort, remotePort: l4.dstPort };
    } else if (pkt.icmp?.type === 8) {
      key = natKey("ICMP", pkt.icmp.id, ip.dst, undefined);
      entry = { proto: "ICMP", insideIp: ip.src, publicIp, remoteIp: ip.dst, id: pkt.icmp.id };
    }
    if (key && entry) router.nat.table.set(key, entry);
    return {
      ...pkt,
      ip: { ...ip, src: publicIp },
      note: `NAT (masquerade) di ${router.name}: alamat sumber ${ip.src} diganti menjadi ${publicIp} sebelum keluar ke ${outIface}.`,
    };
  }

  private dnat(router: Device, inIface: string, frame: Packet): Packet | null {
    if (!router.nat.rules.some((r) => r.out === inIface)) return null;
    const ip = frame.ip!;
    const l4 = frame.tcp ?? frame.udp;
    let entry: NatEntry | undefined;
    let icmp = frame.icmp;
    if (l4) {
      entry = router.nat.table.get(natKey(frame.tcp ? "TCP" : "UDP", l4.dstPort, ip.src, l4.srcPort));
    } else if (frame.icmp?.type === 0) {
      entry = router.nat.table.get(natKey("ICMP", frame.icmp.id, ip.src, undefined));
    } else if (frame.icmp?.orig) {
      const o = frame.icmp.orig;
      entry =
        o.protocol === "ICMP"
          ? router.nat.table.get(natKey("ICMP", o.id, o.dst, undefined))
          : router.nat.table.get(natKey(o.protocol, o.srcPort, o.dst, o.dstPort));
      if (entry) icmp = { ...frame.icmp, orig: { ...o, src: entry.insideIp } };
    }
    if (!entry || entry.publicIp !== ip.dst) return null;
    return {
      ...frame,
      icmp,
      ip: { ...ip, dst: entry.insideIp },
      note: `NAT di ${router.name}: balasan untuk ${entry.publicIp} dikembalikan ke alamat privat ${entry.insideIp} (berdasarkan tabel NAT).`,
    };
  }

  /** Source IP the device would use to reach `dst`. */
  sourceIpFor(device: Device, dst: string): string | null {
    const route = this.lookupRoute(device, dst);
    if (!route) return null;
    return device.interfaces.find((i) => i.name === route.iface)?.ip ?? null;
  }
}

export function sortIps(ips: string[]) {
  return [...ips].sort((a, b) => ipToInt(a) - ipToInt(b));
}
