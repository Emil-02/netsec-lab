import { inSubnet, intToIp, ipToInt } from "../core/ip";
import { PROCESS_MS, type Arrival, type Network } from "../core/network";
import { BROADCAST_MAC } from "../core/packet";
import type { Device, Packet } from "../core/types";

export interface DhcpLease {
  ip: string;
  prefix: number;
  gateway: string;
  dns: string[];
  server: string;
}

export type DhcpResult =
  | { status: "bound"; lease: DhcpLease; log: { at: number; text: string }[]; t: number }
  | { status: "no-offer"; log: { at: number; text: string }[]; t: number };

let xid = 0x3903f326;

function dhcpFrame(
  net: Network,
  srcMac: string,
  dstMac: string,
  srcIp: string,
  dstIp: string,
  fromServer: boolean,
  summary: string,
  data: string,
): Packet {
  return {
    id: net.nextPacketId(),
    eth: { src: srcMac, dst: dstMac, type: "IPv4" },
    ip: { src: srcIp, dst: dstIp, ttl: 64, protocol: "UDP" },
    udp: fromServer ? { srcPort: 67, dstPort: 68 } : { srcPort: 68, dstPort: 67 },
    app: { protocol: "DHCP", summary, data },
  };
}

function pickAddress(net: Network, server: Device, clientMac: string): string | null {
  const cfg = server.dhcp!;
  const existing = cfg.leases.get(clientMac);
  if (existing) return existing;
  const taken = new Set(cfg.leases.values());
  for (let n = ipToInt(cfg.start); n <= ipToInt(cfg.end); n++) {
    const ip = intToIp(n);
    if (!taken.has(ip) && !net.findDeviceByIp(ip)) return ip;
  }
  return null;
}

function findServer(arrivals: Arrival[]) {
  return arrivals.find((a) => a.device.dhcp?.iface === a.iface && a.device.services.some((s) => s.port === 67 && s.protocol === "udp"));
}

/** Runs the DHCP DORA exchange (Discover, Offer, Request, Ack) for `iface` of `client`. */
export function dhcpObtain(net: Network, t: number, client: Device, ifaceName: string): DhcpResult {
  const iface = client.interfaces.find((i) => i.name === ifaceName)!;
  const log: { at: number; text: string }[] = [];
  xid = (xid + 0x1f3) >>> 0;
  const tx = `0x${xid.toString(16)}`;

  log.push({ at: t, text: `DHCPDISCOVER on ${ifaceName} to 255.255.255.255 port 67 interval 3` });
  const discover = dhcpFrame(net, iface.mac, BROADCAST_MAC, "0.0.0.0", "255.255.255.255", false, `DHCP Discover - Transaction ID ${tx}`,
    `Halo semua! Saya ${iface.mac}, belum punya alamat IP.\nAdakah DHCP server di jaringan ini?`);
  const heard = findServer(net.transmitFrame(t, client, ifaceName, discover));
  if (!heard) {
    log.push({ at: t + 1500, text: `DHCPDISCOVER on ${ifaceName} to 255.255.255.255 port 67 interval 6` });
    log.push({ at: t + 3000, text: "No DHCPOFFERS received." });
    return { status: "no-offer", log, t: t + 3000 };
  }

  const server = heard.device;
  const cfg = server.dhcp!;
  const serverIface = server.interfaces.find((i) => i.name === heard.iface)!;
  const serverIp = serverIface.ip!;
  const offered = pickAddress(net, server, iface.mac);
  if (!offered) {
    log.push({ at: heard.t, text: "No DHCPOFFERS received. (pool alamat DHCP server sudah habis)" });
    return { status: "no-offer", log, t: heard.t + 3000 };
  }
  const details = `Alamat IP   : ${offered}/${cfg.prefix}\nGateway     : ${cfg.gateway}\nDNS server  : ${cfg.dns.join(", ") || "-"}\nLease time  : 43200 detik`;
  const offer = dhcpFrame(net, serverIface.mac, iface.mac, serverIp, "255.255.255.255", true, `DHCP Offer - ${offered} - Transaction ID ${tx}`,
    `Tawaran dari ${serverIp}:\n${details}`);
  const gotOffer = net.transmitFrame(heard.t + PROCESS_MS, server, heard.iface, offer).find((a) => a.device.id === client.id);
  if (!gotOffer) return { status: "no-offer", log, t: heard.t + 3000 };
  log.push({ at: gotOffer.t, text: `DHCPOFFER of ${offered} from ${serverIp}` });

  log.push({ at: gotOffer.t + 40, text: `DHCPREQUEST for ${offered} on ${ifaceName} to 255.255.255.255 port 67` });
  const request = dhcpFrame(net, iface.mac, BROADCAST_MAC, "0.0.0.0", "255.255.255.255", false, `DHCP Request - ${offered} - Transaction ID ${tx}`,
    `Saya terima tawaran ${offered} dari ${serverIp}. Tolong konfirmasi!`);
  const heardReq = net.transmitFrame(gotOffer.t + 40, client, ifaceName, request).find((a) => a.device.id === server.id);
  if (!heardReq) return { status: "no-offer", log, t: gotOffer.t + 3000 };

  cfg.leases.set(iface.mac, offered);
  const ack = dhcpFrame(net, serverIface.mac, iface.mac, serverIp, "255.255.255.255", true, `DHCP ACK - ${offered} - Transaction ID ${tx}`,
    `Disetujui! ${offered} sekarang milik ${iface.mac}.\n${details}`);
  const gotAck = net.transmitFrame(heardReq.t + PROCESS_MS, server, heard.iface, ack).find((a) => a.device.id === client.id);
  if (!gotAck) return { status: "no-offer", log, t: heardReq.t + 3000 };
  log.push({ at: gotAck.t, text: `DHCPACK of ${offered} from ${serverIp}` });
  return { status: "bound", lease: { ip: offered, prefix: cfg.prefix, gateway: cfg.gateway, dns: cfg.dns, server: serverIp }, log, t: gotAck.t };
}

/** Applies a lease to the client: IP address, default route and /etc/resolv.conf. */
export function applyLease(client: Device, ifaceName: string, lease: DhcpLease) {
  const iface = client.interfaces.find((i) => i.name === ifaceName)!;
  iface.ip = lease.ip;
  iface.prefix = lease.prefix;
  client.routes = client.routes.filter((r) => r.prefix !== 0);
  if (inSubnet(lease.gateway, lease.ip, lease.prefix)) client.routes.push({ network: "0.0.0.0", prefix: 0, via: lease.gateway });
  client.dnsServers = [...lease.dns];
  client.dhcpLease = { iface: ifaceName, ip: lease.ip, server: lease.server };
  if (client.fs) {
    const content = `# dibuat oleh dhclient\n${lease.dns.map((d) => `nameserver ${d}`).join("\n")}\n`;
    client.fs.writeFile("/etc/resolv.conf", content, "root");
  }
}
