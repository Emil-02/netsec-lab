export function isValidIp(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

export function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => ((acc << 8) | Number(octet)) >>> 0, 0);
}

export function intToIp(n: number): string {
  return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join(".");
}

export function prefixToMaskInt(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function prefixToMask(prefix: number): string {
  return intToIp(prefixToMaskInt(prefix));
}

export function maskToPrefix(mask: string): number | null {
  if (!isValidIp(mask)) return null;
  const bits = ipToInt(mask).toString(2).padStart(32, "0");
  if (!/^1*0*$/.test(bits)) return null;
  const firstZero = bits.indexOf("0");
  return firstZero === -1 ? 32 : firstZero;
}

export function networkAddress(ip: string, prefix: number): string {
  return intToIp((ipToInt(ip) & prefixToMaskInt(prefix)) >>> 0);
}

export function broadcastAddress(ip: string, prefix: number): string {
  return intToIp((ipToInt(ip) | ~prefixToMaskInt(prefix)) >>> 0);
}

export function inSubnet(ip: string, network: string, prefix: number): boolean {
  const mask = prefixToMaskInt(prefix);
  return ((ipToInt(ip) & mask) >>> 0) === ((ipToInt(network) & mask) >>> 0);
}

/** Parses "192.168.1.10/24" (a bare IP defaults to /32). */
export function parseCidr(value: string): { ip: string; prefix: number } | null {
  const [ip, prefixRaw] = value.split("/");
  if (!isValidIp(ip)) return null;
  const prefix = prefixRaw === undefined ? 32 : Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  return { ip, prefix };
}

export function isPrivateIp(ip: string): boolean {
  return (
    inSubnet(ip, "10.0.0.0", 8) ||
    inSubnet(ip, "172.16.0.0", 12) ||
    inSubnet(ip, "192.168.0.0", 16)
  );
}

export function ipClass(ip: string): "A" | "B" | "C" | "D" | "E" {
  const first = Number(ip.split(".")[0]);
  if (first < 128) return "A";
  if (first < 192) return "B";
  if (first < 224) return "C";
  if (first < 240) return "D";
  return "E";
}

export function toBinaryIp(ip: string): string {
  return ip
    .split(".")
    .map((o) => Number(o).toString(2).padStart(8, "0"))
    .join(".");
}

export interface SubnetInfo {
  ip: string;
  prefix: number;
  mask: string;
  wildcard: string;
  network: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  totalAddresses: number;
  usableHosts: number;
  ipClass: ReturnType<typeof ipClass>;
  isPrivate: boolean;
  binaryIp: string;
  binaryMask: string;
}

export function subnetInfo(ip: string, prefix: number): SubnetInfo {
  const net = ipToInt(networkAddress(ip, prefix));
  const bcast = ipToInt(broadcastAddress(ip, prefix));
  const total = 2 ** (32 - prefix);
  const usable = prefix === 32 ? 1 : prefix === 31 ? 2 : total - 2;
  return {
    ip,
    prefix,
    mask: prefixToMask(prefix),
    wildcard: intToIp(~prefixToMaskInt(prefix) >>> 0),
    network: intToIp(net),
    broadcast: intToIp(bcast),
    firstHost: intToIp(prefix >= 31 ? net : net + 1),
    lastHost: intToIp(prefix >= 31 ? bcast : bcast - 1),
    totalAddresses: total,
    usableHosts: usable,
    ipClass: ipClass(ip),
    isPrivate: isPrivateIp(ip),
    binaryIp: toBinaryIp(ip),
    binaryMask: toBinaryIp(prefixToMask(prefix)),
  };
}
