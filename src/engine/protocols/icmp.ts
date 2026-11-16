import { HOP_MS, PROCESS_MS, type IpOutcome, type Network } from "../core/network";
import type { Device, Packet } from "../core/types";

export type EchoResult =
  | { kind: "reply"; from: string; ttl: number; t: number; hops: number }
  | { kind: "ttl-exceeded"; from: string; t: number; hops: number }
  | { kind: "unreachable"; from: string; t: number; reason: "host" | "net" | "port" }
  | { kind: "eperm"; t: number }
  | { kind: "timeout"; t: number };

export type DeliveryFailure =
  | { kind: "unreachable"; reason: "net" | "host" | "port"; from: string | null; t: number }
  | { kind: "refused"; t: number }
  | { kind: "eperm"; t: number }
  | { kind: "timeout"; t: number };

type FailedOutcome = Extract<IpOutcome, { status: "no-route" | "arp-failed" | "ttl-exceeded" }> | Extract<IpOutcome, { status: "delivered" }>;

const ERROR_NAMES: Record<string, string> = {
  "3/0": "Destination Net Unreachable",
  "3/1": "Destination Host Unreachable",
  "3/3": "Destination Port Unreachable",
  "11/0": "Time Exceeded",
};

/** The device in `outcome` sends an ICMP error back to the original sender. */
export function icmpError(net: Network, outcome: FailedOutcome, type: number, code: number): IpOutcome | null {
  const reporter = outcome.device;
  const orig = outcome.packet;
  const ip = orig.ip!;
  const fromIp =
    (outcome.iface && outcome.iface !== "lo" && reporter.interfaces.find((i) => i.name === outcome.iface)?.ip) ||
    net.sourceIpFor(reporter, ip.src);
  if (!fromIp) return null;
  const l4 = orig.tcp ?? orig.udp;
  const notice: Packet = {
    id: net.nextPacketId(),
    ip: { src: fromIp, dst: ip.src, ttl: 64, protocol: "ICMP" },
    icmp: {
      type,
      code,
      name: ERROR_NAMES[`${type}/${code}`] ?? "ICMP Error",
      seq: orig.icmp?.seq,
      id: orig.icmp?.id,
      orig: { src: ip.src, dst: ip.dst, protocol: ip.protocol, srcPort: l4?.srcPort, dstPort: l4?.dstPort, id: orig.icmp?.id },
    },
  };
  return net.sendIp(outcome.t + PROCESS_MS, reporter, notice);
}

/** Turns a failed delivery into what the sender observes (ICMP error from a router, or silence). */
export function deliveryFailure(net: Network, outcome: IpOutcome, origin: Device): DeliveryFailure {
  if (outcome.status === "dropped" && outcome.reason === "firewall" && outcome.device.id === origin.id && outcome.hops === 0) {
    return { kind: "eperm", t: outcome.t };
  }
  if (outcome.status === "rejected") {
    const back = outcome.back;
    if (back?.status === "delivered" && back.device.id === origin.id) {
      if (back.packet.tcp?.flags.includes("RST")) return { kind: "refused", t: back.t };
      return { kind: "unreachable", reason: "port", from: back.packet.ip!.src, t: back.t };
    }
    return { kind: "timeout", t: outcome.t + HOP_MS * 2 };
  }
  if (outcome.status === "no-route" || outcome.status === "arp-failed") {
    const reason = outcome.status === "no-route" ? "net" : "host";
    if (outcome.device.id === origin.id) return { kind: "unreachable", reason, from: null, t: outcome.t };
    const back = icmpError(net, outcome, 3, reason === "net" ? 0 : 1);
    if (back?.status === "delivered" && back.device.id === origin.id) {
      return { kind: "unreachable", reason, from: back.packet.ip!.src, t: back.t };
    }
    return { kind: "timeout", t: (back?.t ?? outcome.t) + HOP_MS };
  }
  return { kind: "timeout", t: outcome.t + HOP_MS * 2 };
}

export function echoRequest(
  net: Network,
  t: number,
  src: Device,
  srcIp: string,
  dstIp: string,
  seq: number,
  ttl = 64,
  id = 0,
): EchoResult {
  const request: Packet = {
    id: net.nextPacketId(),
    ip: { src: srcIp, dst: dstIp, ttl, protocol: "ICMP" },
    icmp: { type: 8, code: 0, name: "Echo Request", seq, id },
  };
  const outcome = net.sendIp(t, src, request);

  if (outcome.status === "delivered") {
    const target = outcome.device;
    if (target.id === src.id) return { kind: "reply", from: dstIp, ttl: 64, t: outcome.t + 1, hops: 0 };
    const reply: Packet = {
      id: net.nextPacketId(),
      ip: { src: outcome.packet.ip!.dst, dst: outcome.packet.ip!.src, ttl: 64, protocol: "ICMP" },
      icmp: { type: 0, code: 0, name: "Echo Reply", seq, id },
    };
    const back = net.sendIp(outcome.t + PROCESS_MS, target, reply);
    if (back.status !== "delivered" || back.device.id !== src.id) return { kind: "timeout", t: back.t + HOP_MS };
    return { kind: "reply", from: dstIp, ttl: back.packet.ip!.ttl, t: back.t, hops: outcome.hops + back.hops };
  }

  if (outcome.status === "ttl-exceeded") {
    const back = icmpError(net, outcome, 11, 0);
    if (back?.status !== "delivered" || back.device.id !== src.id) return { kind: "timeout", t: (back?.t ?? outcome.t) + HOP_MS };
    return { kind: "ttl-exceeded", from: back.packet.ip!.src, t: back.t, hops: outcome.hops + back.hops };
  }

  const failure = deliveryFailure(net, outcome, src);
  if (failure.kind === "unreachable") {
    return { kind: "unreachable", from: failure.from ?? srcIp, t: failure.t, reason: failure.reason };
  }
  if (failure.kind === "eperm") return failure;
  if (failure.kind === "refused") return { kind: "unreachable", from: dstIp, t: failure.t, reason: "port" };
  return failure;
}

/** A plausible (not animation-based) round trip time in ms for display. */
export function fakeRtt(hops: number, seq: number) {
  const jitter = ((seq * 37) % 17) / 100;
  return (0.3 + hops * 0.45 + jitter).toFixed(3);
}
