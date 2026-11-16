import { emptyFirewall } from "./core/firewall";
import { parseCidr } from "./core/ip";
import { Network } from "./core/network";
import type { Device, DeviceKind, DnsRecord, Service, WebServerConfig } from "./core/types";
import { VirtualFS, type FileSpec } from "./shell/fs";

export interface InterfaceSpec {
  name: string;
  /** e.g. "192.168.1.10/24" */
  ip?: string;
  mac?: string;
  up?: boolean;
}

export interface DeviceSpec {
  id: string;
  kind: DeviceKind;
  name?: string;
  hostname?: string;
  position: { x: number; y: number };
  interfaces?: InterfaceSpec[];
  gateway?: string;
  routes?: { to: string; via: string }[];
  services?: Service[];
  hosts?: Record<string, string>;
  /** Nameservers written to /etc/resolv.conf. */
  dns?: string[];
  /** Makes this device a DNS server (adds udp/53). */
  dnsServer?: { records: DnsRecord[]; forwarder?: string };
  /** Makes this device a DHCP server on `iface` (adds udp/67). */
  dhcpServer?: { iface: string; start: string; end: string; prefix: number; gateway: string; dns: string[] };
  /** Pre-enabled NAT masquerade on this outside interface. */
  nat?: { outside: string };
  /**
   * Makes this device a web server (adds tcp/80 unless services already define it).
   * May be a factory so every lab (re)start gets fresh app state, such as a database.
   */
  web?: WebSpec | (() => WebSpec);
  /** Forward IP packets for others (routers do this by default; e.g. a MITM host). */
  ipForward?: boolean;
  /** SSH login accounts (username -> password). */
  accounts?: Record<string, string>;
  /** OS fingerprint shown by `nmap -O`. */
  os?: string;
  /** Initial packet filter, e.g. { INPUT: { policy: "DROP" } }. */
  firewall?: Partial<Record<"INPUT" | "FORWARD" | "OUTPUT", { policy?: "ACCEPT" | "DROP" }>>;
  /** Switch port settings, applied after links create the ports. */
  ports?: Record<string, { vlan?: number; trunk?: boolean }>;
  user?: string;
  /** Files to create in the device's virtual filesystem (relative paths are under $HOME). */
  files?: Record<string, FileSpec>;
}

export type WebSpec = WebServerConfig & { https?: boolean; port?: number };

export interface TopologySpec {
  /** Active ARP spoofing at lab start: `victim` believes `ip` belongs to `attacker`. */
  arpPoison?: { victim: string; ip: string; attacker: string }[];
  devices: DeviceSpec[];
  /** "deviceId:iface" pairs. Missing interfaces are created automatically. */
  links: [string, string][];
}

const ROUTING_KINDS: DeviceKind[] = ["router", "firewall", "internet"];
const SHELL_KINDS: DeviceKind[] = ["pc", "laptop", "server", "attacker", "router", "firewall"];

function macFor(deviceIndex: number, ifaceIndex: number) {
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `02:42:ac:${hex(deviceIndex + 1)}:${hex(ifaceIndex)}:${hex((deviceIndex * 7 + ifaceIndex * 13 + 0x10) & 0xff)}`;
}

function defaultUser(kind: DeviceKind) {
  if (kind === "router" || kind === "firewall") return "root";
  if (kind === "attacker") return "kali";
  if (kind === "switch") return "admin";
  if (kind === "server") return "admin";
  return "siswa";
}

function withDefaultServices(ds: DeviceSpec, web: WebSpec | undefined): Service[] {
  const services = [...(ds.services ?? [])];
  const ensure = (s: Service) => {
    if (!services.some((x) => x.port === s.port && x.protocol === s.protocol)) services.push(s);
  };
  if (web) {
    ensure({ port: web.port ?? 80, protocol: "tcp", name: "http" });
    if (web.https) ensure({ port: 443, protocol: "tcp", name: "https" });
  }
  if (ds.dnsServer) ensure({ port: 53, protocol: "udp", name: "domain" });
  if (ds.dhcpServer) ensure({ port: 67, protocol: "udp", name: "bootps" });
  return services.sort((a, b) => a.port - b.port);
}

export function buildNetwork(spec: TopologySpec): Network {
  const net = new Network();

  spec.devices.forEach((ds, index) => {
    const user = ds.user ?? defaultUser(ds.kind);
    const hostname = ds.hostname ?? ds.id;
    const web = typeof ds.web === "function" ? ds.web() : ds.web;
    const device: Device = {
      id: ds.id,
      name: ds.name ?? ds.id,
      hostname,
      kind: ds.kind,
      position: ds.position,
      interfaces: (ds.interfaces ?? []).map((is, i) => {
        const cidr = is.ip ? parseCidr(is.ip) : null;
        return { name: is.name, mac: is.mac ?? macFor(index, i), ip: cidr?.ip, prefix: cidr?.prefix, up: is.up ?? true };
      }),
      routes: [],
      arp: new Map(),
      macTable: new Map(),
      services: withDefaultServices(ds, web),
      forwarding: ds.ipForward ?? ROUTING_KINDS.includes(ds.kind),
      hosts: ds.hosts ?? {},
      dnsServers: ds.dns ?? [],
      dns: ds.dnsServer ? { records: ds.dnsServer.records, forwarder: ds.dnsServer.forwarder } : undefined,
      dhcp: ds.dhcpServer ? { ...ds.dhcpServer, leases: new Map() } : undefined,
      nat: { rules: ds.nat ? [{ chain: "POSTROUTING", out: ds.nat.outside, target: "MASQUERADE" }] : [], table: new Map() },
      web: web ? { software: web.software, routes: web.routes, sqlLog: web.sqlLog, state: web.state } : undefined,
      accounts: ds.accounts ?? {},
      os: ds.os,
      firewall: emptyFirewall(),
      conntrack: new Set(),
      user,
    };
    for (const [chain, cfg] of Object.entries(ds.firewall ?? {})) {
      if (cfg?.policy) device.firewall.chains[chain as "INPUT"].policy = cfg.policy;
    }
    if (ds.gateway) device.routes.push({ network: "0.0.0.0", prefix: 0, via: ds.gateway });
    for (const r of ds.routes ?? []) {
      const cidr = r.to === "default" ? { ip: "0.0.0.0", prefix: 0 } : parseCidr(r.to);
      if (cidr) device.routes.push({ network: cidr.ip, prefix: cidr.prefix, via: r.via });
    }
    if (SHELL_KINDS.includes(ds.kind)) {
      device.fs = VirtualFS.create(user, ds.files);
      device.fs.writeFile("/etc/hostname", `${hostname}\n`, "root");
      const hostsFile = Object.entries(ds.hosts ?? {}).map(([name, ip]) => `${ip}\t${name}`).join("\n");
      device.fs.writeFile("/etc/hosts", `127.0.0.1\tlocalhost\n${hostsFile}${hostsFile ? "\n" : ""}`, "root");
      const resolv = ds.dns?.length ? ds.dns.map((d) => `nameserver ${d}`).join("\n") : "# belum ada DNS server";
      device.fs.writeFile("/etc/resolv.conf", `${resolv}\n`, "root");
    }
    net.addDevice(device);
  });

  spec.links.forEach(([a, b], idx) => {
    const [aDev, aIf] = a.split(":");
    const [bDev, bIf] = b.split(":");
    for (const [devId, ifName] of [
      [aDev, aIf],
      [bDev, bIf],
    ]) {
      const device = net.device(devId);
      if (!device.interfaces.some((i) => i.name === ifName)) {
        const deviceIndex = spec.devices.findIndex((d) => d.id === devId);
        device.interfaces.push({ name: ifName, mac: macFor(deviceIndex, device.interfaces.length), up: true });
      }
    }
    net.addLink({ id: `link-${idx}`, a: { device: aDev, iface: aIf }, b: { device: bDev, iface: bIf } });
  });

  for (const ds of spec.devices) {
    const device = net.device(ds.id);
    for (const [port, cfg] of Object.entries(ds.ports ?? {})) {
      const iface = device.interfaces.find((i) => i.name === port);
      if (!iface) throw new Error(`Port ${port} tidak ada di ${ds.id}`);
      iface.vlan = cfg.vlan;
      iface.trunk = cfg.trunk;
    }
  }

  for (const p of spec.arpPoison ?? []) {
    const attacker = net.device(p.attacker);
    const victim = net.device(p.victim);
    const iface = victim.interfaces[0];
    net.poisons.push({ victim: victim.id, ip: p.ip, mac: attacker.interfaces[0].mac, iface: iface.name, by: attacker.id });
  }
  net.enforcePoison();

  return net;
}
