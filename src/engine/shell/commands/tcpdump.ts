import type { CapturedFrame } from "../../core/network";
import type { Packet } from "../../core/types";
import { ansi, hasFlag, requireRoot, type CommandContext, type CommandDef } from "../types";

type Matcher = (p: Packet) => boolean;

function portsOf(p: Packet) {
  const l4 = p.tcp ?? p.udp;
  return l4 ? [l4.srcPort, l4.dstPort] : [];
}

/** Parses a small subset of tcpdump filter syntax: proto names, host X, port N, and/or/not. */
export function parseFilter(words: string[]): Matcher | string {
  let i = 0;
  const next = () => (words[i] ?? "").toLowerCase();

  const primitive = (): Matcher | string => {
    let w = next();
    if (w === "not" || w === "!") {
      i++;
      const inner = primitive();
      return typeof inner === "string" ? inner : (p) => !inner(p);
    }
    let dir: "src" | "dst" | null = null;
    if (w === "src" || w === "dst") {
      dir = w;
      i++;
      w = next();
    }
    if (w === "host") {
      const ip = words[i + 1];
      i += 2;
      if (!ip) return "tcpdump: syntax error (host butuh alamat IP)";
      return (p) => {
        const src = p.ip?.src ?? p.arp?.senderIp;
        const dst = p.ip?.dst ?? p.arp?.targetIp;
        return dir === "src" ? src === ip : dir === "dst" ? dst === ip : src === ip || dst === ip;
      };
    }
    if (w === "port") {
      const port = Number(words[i + 1]);
      i += 2;
      if (!Number.isInteger(port)) return "tcpdump: syntax error (port butuh angka)";
      return (p) => {
        const l4 = p.tcp ?? p.udp;
        if (!l4) return false;
        return dir === "src" ? l4.srcPort === port : dir === "dst" ? l4.dstPort === port : portsOf(p).includes(port);
      };
    }
    if (["arp", "icmp", "tcp", "udp", "ip"].includes(w)) {
      i++;
      if (next() === "port" && (w === "tcp" || w === "udp")) {
        const proto = w;
        const inner = primitive();
        return typeof inner === "string" ? inner : (p) => !!p[proto] && inner(p);
      }
      return (p) => (w === "ip" ? !!p.ip : !!p[w as "arp" | "icmp" | "tcp" | "udp"]);
    }
    return `tcpdump: syntax error near "${words[i] ?? ""}"`;
  };

  if (!words.length) return () => true;
  let acc = primitive();
  if (typeof acc === "string") return acc;
  while (i < words.length) {
    const op = next();
    if (op !== "and" && op !== "or" && op !== "&&" && op !== "||") return `tcpdump: syntax error near "${words[i]}"`;
    i++;
    const rhs = primitive();
    if (typeof rhs === "string") return rhs;
    const lhs: Matcher = acc;
    acc = op === "and" || op === "&&" ? (p) => lhs(p) && rhs(p) : (p) => lhs(p) || rhs(p);
  }
  return acc;
}

function timestamp(ms: number) {
  const total = 36000000 + ms;
  const h = Math.floor(total / 3600000) % 24;
  const m = Math.floor(total / 60000) % 60;
  const s = Math.floor(total / 1000) % 60;
  const us = Math.floor((total % 1000) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(us).padStart(6, "0")}`;
}

export function formatFrame(f: CapturedFrame, ascii: boolean): string[] {
  const p = f.packet;
  const ts = timestamp(f.t);
  if (p.arp) {
    const a = p.arp;
    return [
      a.op === "request"
        ? `${ts} ARP, Request who-has ${a.targetIp} tell ${a.senderIp}, length 28`
        : `${ts} ARP, Reply ${a.senderIp} is-at ${a.senderMac}, length 28`,
    ];
  }
  if (!p.ip) return [`${ts} unknown frame`];
  const ip = p.ip;
  let line: string;
  if (p.icmp) {
    const i = p.icmp;
    const what = i.type === 8 ? "echo request" : i.type === 0 ? "echo reply" : i.name.toLowerCase();
    line = `${ts} IP ${ip.src} > ${ip.dst}: ICMP ${what}${i.id ? `, id ${i.id}` : ""}${i.seq !== undefined ? `, seq ${i.seq}` : ""}, length 64`;
  } else if (p.tcp) {
    const t = p.tcp;
    const flagMap: Record<string, string> = { SYN: "S", ACK: ".", PSH: "P", FIN: "F", RST: "R" };
    const flags = t.flags.map((x) => flagMap[x] ?? "").join("").replace(/^\.(.+)/, "$1.") || ".";
    line = `${ts} IP ${ip.src}.${t.srcPort} > ${ip.dst}.${t.dstPort}: Flags [${flags}], seq ${t.seq ?? 0}${t.ack !== undefined ? `, ack ${t.ack}` : ""}, length ${t.len ?? 0}`;
    if (p.app && p.app.protocol === "HTTP") line += `: HTTP: ${p.app.summary}`;
  } else if (p.udp) {
    const u = p.udp;
    const app = p.app ? ` ${p.app.protocol}: ${p.app.summary}` : "";
    line = `${ts} IP ${ip.src}.${u.srcPort} > ${ip.dst}.${u.dstPort}: UDP${app}`;
  } else {
    line = `${ts} IP ${ip.src} > ${ip.dst}`;
  }
  const out = [line];
  if (ascii && p.app?.data && p.app.protocol !== "TLS") out.push(...p.app.data.split("\n").map((l) => ansi.dim(l)));
  return out;
}

function tcpdump(ctx: CommandContext): number {
  if (!requireRoot(ctx, "tcpdump: eth0: You don't have permission to capture on that device")) return 1;
  const args = ctx.args;
  const take = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const iface = take("-i") ?? ctx.device.interfaces[0]?.name ?? "eth0";
  if (iface !== "any" && !ctx.device.interfaces.some((i) => i.name === iface)) {
    ctx.error(`tcpdump: ${iface}: No such device exists`);
    return 1;
  }
  const count = take("-c") ? Number(take("-c")) : undefined;
  const ascii = hasFlag(args, "-A");
  const promisc = !hasFlag(args, "-p");
  const valued = new Set(["-i", "-c", "-w", "-s"]);
  const filterWords = args.filter((a, i) => !a.startsWith("-") && !(i > 0 && valued.has(args[i - 1])));
  const match = parseFilter(filterWords);
  if (typeof match === "string") {
    ctx.error(match);
    return 1;
  }

  ctx.print("tcpdump: verbose output suppressed, use -v[v]... for full protocol decode");
  ctx.print(`listening on ${iface}, link-type EN10MB (Ethernet), snapshot length 262144 bytes`);
  const session = { iface, promisc, frames: [] as CapturedFrame[] };
  ctx.net.captures.set(ctx.device.id, session);
  const started = ctx.t;
  try {
    ctx.t = Math.max(ctx.runBackground(), started + 3000);
  } finally {
    ctx.net.captures.delete(ctx.device.id);
  }

  const shown = session.frames.filter((f) => match(f.packet)).slice(0, count ?? Infinity);
  for (const f of shown) for (const line of formatFrame(f, ascii)) ctx.printAt(f.t, line);
  ctx.print("^C");
  ctx.print(`${shown.length} packets captured`);
  ctx.print(`${session.frames.length} packets received by filter`);
  ctx.print("0 packets dropped by kernel");

  ctx.fact(`tcpdump:run:${ctx.device.id}`);
  if (filterWords.length) ctx.fact("tcpdump:filter");
  for (const f of shown) {
    const p = f.packet;
    if (p.app?.protocol === "HTTP" && /pass(word)?=/i.test(p.app.data ?? "")) {
      ctx.fact("tcpdump:saw-http-password");
      if (ascii) ctx.fact("tcpdump:read-http-password");
    }
    if (p.ip && !ctx.device.interfaces.some((i) => i.ip === p.ip!.src || i.ip === p.ip!.dst)) ctx.fact("tcpdump:saw-others");
  }
  return 0;
}

export const tcpdumpCommand: CommandDef = {
  name: "tcpdump",
  category: "keamanan",
  summary: "Menangkap & menampilkan paket yang lewat di interface (sniffer)",
  usage: "sudo tcpdump [-i eth0] [-n] [-A] [-c jumlah] [filter, mis. 'tcp port 80']",
  run: tcpdump,
};
