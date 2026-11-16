import type { VirtualFS } from "../shell/fs";

export type DeviceKind =
  | "pc"
  | "laptop"
  | "server"
  | "router"
  | "switch"
  | "hub"
  | "attacker"
  | "firewall"
  | "internet";

export interface NetInterface {
  name: string;
  mac: string;
  ip?: string;
  prefix?: number;
  up: boolean;
  /** Switch access VLAN (default 1). */
  vlan?: number;
  /** Switch trunk port: carries every VLAN and tags all except native VLAN 1. */
  trunk?: boolean;
}

export interface StaticRoute {
  network: string;
  prefix: number;
  via: string;
}

export interface Service {
  port: number;
  protocol: "tcp" | "udp";
  name: string;
  banner?: string;
  /** Address the service listens on (default 0.0.0.0 = all interfaces). */
  bind?: string;
  /** Product/version string reported by `nmap -sV`. */
  version?: string;
}

export interface ArpEntry {
  mac: string;
  iface: string;
  /** Set manually with `arp -s`; never overwritten by ARP replies. */
  static?: boolean;
}

export interface MacEntry {
  mac: string;
  port: string;
  vlan: number;
}

export type DnsRecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS";

export interface DnsRecord {
  name: string;
  type: DnsRecordType;
  value: string;
  ttl?: number;
}

export interface DnsServerConfig {
  records: DnsRecord[];
  /** Upstream resolver used for names this server is not authoritative for. */
  forwarder?: string;
}

export interface DhcpServerConfig {
  iface: string;
  start: string;
  end: string;
  prefix: number;
  gateway: string;
  dns: string[];
  /** client MAC -> leased IP */
  leases: Map<string, string>;
}

export interface NatRule {
  chain: "POSTROUTING";
  out: string;
  target: "MASQUERADE";
}

export interface NatEntry {
  proto: "TCP" | "UDP" | "ICMP";
  insideIp: string;
  publicIp: string;
  remoteIp: string;
  port?: number;
  remotePort?: number;
  id?: number;
}

export interface NatConfig {
  rules: NatRule[];
  table: Map<string, NatEntry>;
}

export type FwChain = "INPUT" | "FORWARD" | "OUTPUT";
export type FwTarget = "ACCEPT" | "DROP" | "REJECT" | "LOG";
export type ConnState = "NEW" | "ESTABLISHED" | "RELATED" | "INVALID";

export interface FwAddr {
  ip: string;
  prefix: number;
}

export interface FwRule {
  proto?: "tcp" | "udp" | "icmp";
  src?: FwAddr;
  dst?: FwAddr;
  sport?: number;
  dport?: number;
  inIface?: string;
  outIface?: string;
  states?: ConnState[];
  target: FwTarget;
  rejectWith?: "icmp-port-unreachable" | "tcp-reset";
  logPrefix?: string;
  pkts: number;
  bytes: number;
}

export interface Firewall {
  chains: Record<FwChain, { policy: "ACCEPT" | "DROP"; rules: FwRule[]; pkts: number; bytes: number }>;
}

export interface HttpRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
  form: Record<string, string>;
  clientIp: string;
  host: string;
  secure: boolean;
}

export interface HttpResponse {
  status?: number;
  headers?: Record<string, string>;
  contentType?: string;
  body?: string;
}

export type WebRoute = HttpResponse | ((req: HttpRequest) => HttpResponse);

export interface SqlLogEntry {
  sql: string;
  /** Bound parameters (prepared statements only). */
  params?: string[];
  ok: boolean;
  rows?: number;
  error?: string;
  /** Path of the page that ran the query. */
  path: string;
  /** Label set by the app for notable events (used by lab objectives), e.g. "login-bypass". */
  tag?: string;
}

export interface WebServerConfig {
  software?: string;
  routes: Record<string, WebRoute>;
  /** Queries executed by the app's database layer (shown in the device panel). */
  sqlLog?: SqlLogEntry[];
  /** Arbitrary app state that lab objectives may inspect (e.g. guestbook entries). */
  state?: Record<string, unknown>;
}

export interface Device {
  id: string;
  name: string;
  hostname: string;
  kind: DeviceKind;
  position: { x: number; y: number };
  interfaces: NetInterface[];
  routes: StaticRoute[];
  arp: Map<string, ArpEntry>;
  /** Switch MAC address table, keyed by "vlan|mac". */
  macTable: Map<string, MacEntry>;
  services: Service[];
  /** Routers forward IP packets that are not addressed to them. */
  forwarding: boolean;
  hosts: Record<string, string>;
  /** Resolvers used when the device has no /etc/resolv.conf (e.g. no filesystem). */
  dnsServers: string[];
  dns?: DnsServerConfig;
  dhcp?: DhcpServerConfig;
  nat: NatConfig;
  web?: WebServerConfig;
  /** Lease obtained by this device's DHCP client. */
  dhcpLease?: { iface: string; ip: string; server: string };
  /** Login accounts (username -> password) for SSH. */
  accounts: Record<string, string>;
  /** Operating system description reported by `nmap -O`. */
  os?: string;
  firewall: Firewall;
  /** Connection tracking: flow keys seen by this device's packet filter. */
  conntrack: Set<string>;
  user: string;
  fs?: VirtualFS;
}

export interface LinkEnd {
  device: string;
  iface: string;
}

export interface Link {
  id: string;
  a: LinkEnd;
  b: LinkEnd;
}

export type ProtocolName = "ARP" | "ICMP" | "TCP" | "UDP" | "DNS" | "HTTP" | "TLS" | "DHCP" | "SSH" | "IPv4";

export interface EthernetHeader {
  src: string;
  dst: string;
  type: "IPv4" | "ARP";
  /** 802.1Q tag, present only on trunk links. */
  vlan?: number;
}

export interface ArpHeader {
  op: "request" | "reply";
  senderMac: string;
  senderIp: string;
  targetMac: string;
  targetIp: string;
}

export interface IpHeader {
  src: string;
  dst: string;
  ttl: number;
  protocol: "ICMP" | "TCP" | "UDP";
}

export interface IcmpHeader {
  type: number;
  code: number;
  name: string;
  seq?: number;
  id?: number;
  /** Header of the packet that triggered an ICMP error (used by NAT and for display). */
  orig?: {
    src: string;
    dst: string;
    protocol: "ICMP" | "TCP" | "UDP";
    srcPort?: number;
    dstPort?: number;
    id?: number;
  };
}

export interface TcpHeader {
  srcPort: number;
  dstPort: number;
  flags: string[];
  seq?: number;
  ack?: number;
  /** Payload length in bytes. */
  len?: number;
}

export interface UdpHeader {
  srcPort: number;
  dstPort: number;
}

export interface DnsMessage {
  id: number;
  response: boolean;
  name: string;
  type: DnsRecordType;
  status?: "NOERROR" | "NXDOMAIN" | "SERVFAIL";
  answers?: DnsRecord[];
}

export interface AppData {
  protocol: ProtocolName;
  summary: string;
  data?: string;
  dns?: DnsMessage;
}

export interface Packet {
  id: string;
  eth?: EthernetHeader;
  arp?: ArpHeader;
  ip?: IpHeader;
  icmp?: IcmpHeader;
  tcp?: TcpHeader;
  udp?: UdpHeader;
  app?: AppData;
  /** Highlighted explanation shown in the packet inspector (e.g. NAT translation). */
  note?: string;
}

export interface HopEvent {
  kind: "hop";
  id: string;
  at: number;
  duration: number;
  linkId: string;
  from: string;
  to: string;
  packet: Packet;
  /** The receiving NIC discarded the frame (e.g. flooded frame for another MAC). */
  ignored?: boolean;
  dropped?: boolean;
  note?: string;
}

export interface OutputEvent {
  kind: "output";
  at: number;
  text: string;
}

/** A page opened in the simulated web browser (shown in the lab's Browser tab). */
export interface BrowserEvent {
  kind: "browser";
  at: number;
  url: string;
  status: number;
  html: string;
  /** Script fragments a real browser would execute (XSS detection). */
  scripts: string[];
}

export type SimEvent = HopEvent | OutputEvent | BrowserEvent;
