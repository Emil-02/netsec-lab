import { HOP_MS, PROCESS_MS, type Network } from "../core/network";
import type { AppData, Device, Packet, Service, TcpHeader } from "../core/types";
import { deliveryFailure, icmpError, type DeliveryFailure } from "./icmp";

export interface TcpConn {
  client: Device;
  clientIp: string;
  clientPort: number;
  server: Device;
  serverIp: string;
  serverPort: number;
  /** Client address as the server sees it (differs from clientIp behind NAT). */
  seenIp: string;
  seenPort: number;
  cSeq: number;
  sSeq: number;
  t: number;
  service: Service;
}

export type ConnectResult =
  | { status: "open"; conn: TcpConn }
  | { status: "refused"; t: number; byFirewall?: boolean }
  | { status: "unreachable"; reason: "net" | "host" | "port"; from: string | null; t: number }
  | { status: "eperm"; t: number }
  | { status: "timeout"; t: number };

function failureToConnect(f: DeliveryFailure): Exclude<ConnectResult, { status: "open" }> {
  if (f.kind === "unreachable") {
    return f.reason === "port" ? { status: "refused", t: f.t, byFirewall: true } : { status: "unreachable", reason: f.reason, from: f.from, t: f.t };
  }
  if (f.kind === "refused") return { status: "refused", t: f.t, byFirewall: true };
  if (f.kind === "eperm") return { status: "eperm", t: f.t };
  return { status: "timeout", t: f.t };
}

function tcpPacket(net: Network, src: string, dst: string, tcp: TcpHeader, app?: AppData): Packet {
  return { id: net.nextPacketId(), ip: { src, dst, ttl: 64, protocol: "TCP" }, tcp, app };
}

function udpPacket(net: Network, src: string, dst: string, srcPort: number, dstPort: number, app?: AppData): Packet {
  return { id: net.nextPacketId(), ip: { src, dst, ttl: 64, protocol: "UDP" }, udp: { srcPort, dstPort }, app };
}

export function listeningService(device: Device, protocol: "tcp" | "udp", port: number, dstIp: string): Service | undefined {
  return device.services.find((s) => {
    if (s.protocol !== protocol || s.port !== port) return false;
    if (!s.bind || s.bind === "0.0.0.0") return true;
    if (s.bind.startsWith("127.")) return dstIp.startsWith("127.");
    return s.bind === dstIp;
  });
}

function clientSource(net: Network, client: Device, dstIp: string) {
  return dstIp.startsWith("127.") ? "127.0.0.1" : net.sourceIpFor(client, dstIp);
}

export function tcpConnect(net: Network, t: number, client: Device, dstIp: string, dstPort: number): ConnectResult {
  const clientIp = clientSource(net, client, dstIp);
  if (!clientIp) return { status: "unreachable", reason: "net", from: null, t };
  const clientPort = net.nextPort();
  const out = net.sendIp(t, client, tcpPacket(net, clientIp, dstIp, { srcPort: clientPort, dstPort, flags: ["SYN"], seq: 0, len: 0 }));
  if (out.status !== "delivered") return failureToConnect(deliveryFailure(net, out, client));

  const server = out.device;
  const serverIp = out.packet.ip!.dst;
  const seenIp = out.packet.ip!.src;
  const seenPort = out.packet.tcp!.srcPort;
  const service = listeningService(server, "tcp", dstPort, serverIp);
  if (!service) {
    const rst = tcpPacket(net, serverIp, seenIp, { srcPort: dstPort, dstPort: seenPort, flags: ["RST", "ACK"], seq: 0, ack: 1, len: 0 });
    const back = net.sendIp(out.t + PROCESS_MS, server, rst);
    return back.status === "delivered" ? { status: "refused", t: back.t } : { status: "timeout", t: back.t + HOP_MS };
  }

  const synAck = tcpPacket(net, serverIp, seenIp, { srcPort: dstPort, dstPort: seenPort, flags: ["SYN", "ACK"], seq: 0, ack: 1, len: 0 });
  const back = net.sendIp(out.t + PROCESS_MS, server, synAck);
  if (back.status !== "delivered") return { status: "timeout", t: back.t + HOP_MS * 2 };
  const ack = tcpPacket(net, clientIp, dstIp, { srcPort: clientPort, dstPort, flags: ["ACK"], seq: 1, ack: 1, len: 0 });
  const fwd = net.sendIp(back.t + 40, client, ack);
  return {
    status: "open",
    conn: { client, clientIp, clientPort, server, serverIp, serverPort: dstPort, seenIp, seenPort, cSeq: 1, sSeq: 1, t: fwd.t, service },
  };
}

/** Sends one data segment (PSH, ACK) on an open connection. Returns false if it was lost. */
export function tcpSend(net: Network, conn: TcpConn, from: "client" | "server", app: AppData, len: number): boolean {
  const fromClient = from === "client";
  const packet = fromClient
    ? tcpPacket(net, conn.clientIp, conn.serverIp, { srcPort: conn.clientPort, dstPort: conn.serverPort, flags: ["PSH", "ACK"], seq: conn.cSeq, ack: conn.sSeq, len }, app)
    : tcpPacket(net, conn.serverIp, conn.seenIp, { srcPort: conn.serverPort, dstPort: conn.seenPort, flags: ["PSH", "ACK"], seq: conn.sSeq, ack: conn.cSeq, len }, app);
  const out = net.sendIp(conn.t + (fromClient ? 40 : PROCESS_MS), fromClient ? conn.client : conn.server, packet);
  if (fromClient) conn.cSeq += len;
  else conn.sSeq += len;
  conn.t = out.status === "delivered" ? out.t : out.t + HOP_MS;
  return out.status === "delivered";
}

/** Graceful close: client FIN → server FIN → client ACK. */
export function tcpClose(net: Network, conn: TcpConn) {
  const fin1 = tcpPacket(net, conn.clientIp, conn.serverIp, {
    srcPort: conn.clientPort,
    dstPort: conn.serverPort,
    flags: ["FIN", "ACK"],
    seq: conn.cSeq,
    ack: conn.sSeq,
    len: 0,
  });
  const a = net.sendIp(conn.t + 40, conn.client, fin1);
  const fin2 = tcpPacket(net, conn.serverIp, conn.seenIp, {
    srcPort: conn.serverPort,
    dstPort: conn.seenPort,
    flags: ["FIN", "ACK"],
    seq: conn.sSeq,
    ack: conn.cSeq + 1,
    len: 0,
  });
  const b = net.sendIp(a.t + PROCESS_MS, conn.server, fin2);
  const last = tcpPacket(net, conn.clientIp, conn.serverIp, {
    srcPort: conn.clientPort,
    dstPort: conn.serverPort,
    flags: ["ACK"],
    seq: conn.cSeq + 1,
    ack: conn.sSeq + 1,
    len: 0,
  });
  const c = net.sendIp(b.t + 40, conn.client, last);
  conn.t = c.t;
}

export type UdpHandler = (server: Device, request: Packet, t: number) => { app: AppData; t: number } | null;

export type UdpResult =
  | { status: "reply"; app: AppData; t: number; server: Device }
  | { status: "port-unreachable"; t: number }
  | { status: "unreachable"; reason: "net" | "host"; from: string | null; t: number }
  | { status: "timeout"; t: number };

function failureToUdp(f: DeliveryFailure): Exclude<UdpResult, { status: "reply" }> {
  if (f.kind === "unreachable") return f.reason === "port" ? { status: "port-unreachable", t: f.t } : { status: "unreachable", reason: f.reason, from: f.from, t: f.t };
  if (f.kind === "refused") return { status: "port-unreachable", t: f.t };
  return { status: "timeout", t: f.t };
}

/** Sends one UDP datagram and waits for a single reply produced by `handler`. */
export function udpExchange(
  net: Network,
  t: number,
  client: Device,
  dstIp: string,
  dstPort: number,
  request: AppData,
  handler: UdpHandler,
  srcPort = net.nextPort(),
): UdpResult {
  const clientIp = clientSource(net, client, dstIp);
  if (!clientIp) return { status: "unreachable", reason: "net", from: null, t };
  const out = net.sendIp(t, client, udpPacket(net, clientIp, dstIp, srcPort, dstPort, request));
  if (out.status !== "delivered") return failureToUdp(deliveryFailure(net, out, client));
  const server = out.device;
  if (!listeningService(server, "udp", dstPort, out.packet.ip!.dst)) {
    const back = icmpError(net, out, 3, 3);
    return back?.status === "delivered" ? { status: "port-unreachable", t: back.t } : { status: "timeout", t: out.t + HOP_MS * 4 };
  }
  const handled = handler(server, out.packet, out.t + PROCESS_MS);
  if (!handled) return { status: "timeout", t: out.t + HOP_MS * 4 };
  const reply = udpPacket(net, out.packet.ip!.dst, out.packet.ip!.src, dstPort, out.packet.udp!.srcPort, handled.app);
  const back = net.sendIp(handled.t, server, reply);
  if (back.status !== "delivered") return { status: "timeout", t: back.t + HOP_MS * 2 };
  return { status: "reply", app: handled.app, t: back.t, server };
}

export const WELL_KNOWN_PORTS: Record<number, string> = {
  20: "ftp-data",
  21: "ftp",
  22: "ssh",
  23: "telnet",
  25: "smtp",
  53: "domain",
  67: "bootps",
  68: "bootpc",
  80: "http",
  110: "pop3",
  123: "ntp",
  143: "imap",
  161: "snmp",
  443: "https",
  445: "microsoft-ds",
  3306: "mysql",
  3389: "ms-wbt-server",
  5432: "postgresql",
  6379: "redis",
  8080: "http-alt",
};
