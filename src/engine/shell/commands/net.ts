import { broadcastAddress, isValidIp, networkAddress, parseCidr, prefixToMask } from "../../core/ip";
import { resolveName } from "../../protocols/dns";
import { HOP_MS } from "../../core/network";
import type { Device } from "../../core/types";
import { echoRequest, fakeRtt } from "../../protocols/icmp";
import { ansi, requireRoot, type CommandContext, type CommandDef } from "../types";

/** Resolves a host name (hosts file, then DNS with visible packets) and advances the time cursor. */
export function resolveHost(ctx: CommandContext, host: string): string | null {
  const res = resolveName(ctx.net, ctx.t, ctx.device, host);
  ctx.t = res.t;
  if (res.ip) {
    if (res.via === "dns") ctx.fact(`dns:resolved:${host.toLowerCase()}`);
    return res.ip;
  }
  ctx.fact(`dns:fail:${host.toLowerCase()}`);
  return null;
}

function findIface(device: Device, name: string | undefined) {
  return device.interfaces.find((i) => i.name === name);
}

function printIpAddr(ctx: CommandContext, only?: string) {
  const ifaces = ctx.device.interfaces.filter((i) => !only || i.name === only);
  if (only && !ifaces.length) {
    ctx.error(`Device "${only}" does not exist.`);
    return 1;
  }
  if (!only) {
    ctx.print(`1: ${ansi.cyan("lo")}: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN`);
    ctx.print(`    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00`);
    ctx.print(`    inet ${ansi.magenta("127.0.0.1/8")} scope host lo`);
  }
  ctx.device.interfaces.forEach((iface, idx) => {
    if (only && iface.name !== only) return;
    const state = iface.up ? ansi.green("UP") : ansi.red("DOWN");
    const flags = iface.up ? "<BROADCAST,MULTICAST,UP,LOWER_UP>" : "<BROADCAST,MULTICAST>";
    ctx.print(`${idx + 2}: ${ansi.cyan(iface.name)}: ${flags} mtu 1500 qdisc fq_codel state ${state}`);
    ctx.print(`    link/ether ${ansi.yellow(iface.mac)} brd ff:ff:ff:ff:ff:ff`);
    if (iface.ip && iface.prefix !== undefined) {
      ctx.print(
        `    inet ${ansi.magenta(`${iface.ip}/${iface.prefix}`)} brd ${broadcastAddress(iface.ip, iface.prefix)} scope global ${iface.name}`,
      );
    }
  });
  ctx.fact("ip:viewed");
      ctx.fact(`ip:viewed:${ctx.device.id}`);
  return 0;
}

function printRoutes(ctx: CommandContext) {
  const d = ctx.device;
  const defaults = d.routes.filter((r) => r.prefix === 0);
  const statics = d.routes.filter((r) => r.prefix !== 0);
  for (const r of defaults) {
    const iface = ctx.net.lookupRoute(d, r.via)?.iface ?? "?";
    ctx.print(`default via ${r.via} dev ${iface}`);
  }
  for (const r of ctx.net.connectedRoutes(d)) {
    ctx.print(`${r.network}/${r.prefix} dev ${r.iface} proto kernel scope link src ${r.src}`);
  }
  for (const r of statics) {
    const iface = ctx.net.lookupRoute(d, r.via)?.iface ?? "?";
    ctx.print(`${r.network}/${r.prefix} via ${r.via} dev ${iface}`);
  }
  ctx.fact("route:viewed");
  ctx.fact(`route:viewed:${ctx.device.id}`);
}

function ipAddrCmd(ctx: CommandContext, rest: string[]) {
  const [action, ...tail] = rest;
  if (!action || action === "show" || action === "list") return printIpAddr(ctx, tail[0] === "dev" ? tail[1] : tail[0]);
  if (action === "add" || action === "del" || action === "delete" || action === "flush") {
    if (!requireRoot(ctx, "RTNETLINK answers")) return 2;
    const devIdx = tail.indexOf("dev");
    const iface = findIface(ctx.device, devIdx >= 0 ? tail[devIdx + 1] : undefined);
    if (!iface) {
      ctx.error(`Cannot find device "${devIdx >= 0 ? tail[devIdx + 1] : ""}". Contoh: ip addr ${action} 192.168.1.10/24 dev eth0`);
      return 1;
    }
    if (action === "flush") {
      iface.ip = undefined;
      iface.prefix = undefined;
      ctx.fact(`ip:flush:${iface.name}`);
      return 0;
    }
    const cidr = parseCidr(tail[0] ?? "");
    if (!cidr) {
      ctx.error(`Error: alamat IP "${tail[0] ?? ""}" tidak valid. Contoh: 192.168.1.10/24`);
      return 1;
    }
    if (action === "add") {
      if (iface.ip) {
        ctx.error(`Error: ${iface.name} sudah punya alamat ${iface.ip}/${iface.prefix}. Hapus dulu dengan 'ip addr del'.`);
        return 2;
      }
      iface.ip = cidr.ip;
      iface.prefix = cidr.prefix;
      ctx.fact(`ip:add:${iface.name}:${cidr.ip}/${cidr.prefix}`);
    } else {
      if (iface.ip !== cidr.ip) {
        ctx.error("RTNETLINK answers: Cannot assign requested address");
        return 2;
      }
      iface.ip = undefined;
      iface.prefix = undefined;
      ctx.fact(`ip:del:${iface.name}`);
    }
    return 0;
  }
  ctx.error(`Perintah "${action}" tidak dikenal. Coba: ip addr show | add | del`);
  return 1;
}

function ipRouteCmd(ctx: CommandContext, rest: string[]) {
  const [action, target, ...tail] = rest;
  if (!action || action === "show" || action === "list") {
    printRoutes(ctx);
    return 0;
  }
  if (action !== "add" && action !== "del" && action !== "delete") {
    ctx.error(`Perintah "${action}" tidak dikenal. Coba: ip route show | add | del`);
    return 1;
  }
  if (!requireRoot(ctx, "RTNETLINK answers")) return 2;
  const dest = target === "default" ? { ip: "0.0.0.0", prefix: 0 } : parseCidr(target ?? "");
  if (!dest) {
    ctx.error(`Error: tujuan "${target ?? ""}" tidak valid. Contoh: ip route ${action} default via 192.168.1.1`);
    return 1;
  }
  const network = networkAddress(dest.ip, dest.prefix);
  if (action === "add") {
    const viaIdx = tail.indexOf("via");
    const via = viaIdx >= 0 ? tail[viaIdx + 1] : undefined;
    if (!via || !isValidIp(via)) {
      ctx.error("Error: gateway tidak valid. Gunakan: ip route add <tujuan> via <IP-gateway>");
      return 1;
    }
    if (!ctx.net.connectedRoutes(ctx.device).some((r) => networkAddress(via, r.prefix) === r.network)) {
      ctx.error("Error: Nexthop has invalid gateway. (Gateway harus berada di jaringan yang sama dengan salah satu interface)");
      return 2;
    }
    if (ctx.device.routes.some((r) => r.network === network && r.prefix === dest.prefix)) {
      ctx.error("RTNETLINK answers: File exists");
      return 2;
    }
    ctx.device.routes.push({ network, prefix: dest.prefix, via });
    ctx.fact(`route:add:${network}/${dest.prefix}:${via}`);
    return 0;
  }
  const before = ctx.device.routes.length;
  ctx.device.routes = ctx.device.routes.filter((r) => !(r.network === network && r.prefix === dest.prefix));
  if (before === ctx.device.routes.length) {
    ctx.error("RTNETLINK answers: No such process");
    return 2;
  }
  ctx.fact(`route:del:${network}/${dest.prefix}`);
  return 0;
}

function ipLinkCmd(ctx: CommandContext, rest: string[]) {
  const [action, name, state] = rest;
  if (!action || action === "show") {
    ctx.device.interfaces.forEach((iface, idx) => {
      ctx.print(`${idx + 2}: ${iface.name}: state ${iface.up ? ansi.green("UP") : ansi.red("DOWN")}`);
      ctx.print(`    link/ether ${iface.mac} brd ff:ff:ff:ff:ff:ff`);
    });
    return 0;
  }
  if (action === "set") {
    if (!requireRoot(ctx, "RTNETLINK answers")) return 2;
    const iface = findIface(ctx.device, name);
    if (!iface || (state !== "up" && state !== "down")) {
      ctx.error("Penggunaan: ip link set <interface> up|down");
      return 1;
    }
    iface.up = state === "up";
    ctx.fact(`link:${iface.name}:${state}`);
    return 0;
  }
  ctx.error(`Perintah "${action}" tidak dikenal. Coba: ip link show | set`);
  return 1;
}

function flushNeigh(ctx: CommandContext, which?: string) {
  if (!requireRoot(ctx, "RTNETLINK answers")) return 2;
  if (which && which !== "all" && isValidIp(which)) ctx.device.arp.delete(which);
  else ctx.device.arp.clear();
  ctx.fact("arp:flushed");
  return 0;
}

function staticArp(ctx: CommandContext, ip?: string, mac?: string) {
  if (!requireRoot(ctx, "SIOCSARP")) return 2;
  if (!ip || !isValidIp(ip) || !mac || !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac)) {
    ctx.error("Penggunaan: sudo arp -s <ip> <mac>   contoh: sudo arp -s 192.168.1.1 02:42:ac:05:00:2b");
    return 1;
  }
  const iface = ctx.net.lookupRoute(ctx.device, ip)?.iface ?? ctx.device.interfaces[0]?.name ?? "eth0";
  ctx.device.arp.set(ip, { mac: mac.toLowerCase(), iface, static: true });
  ctx.fact(`arp:static:${ip}:${mac.toLowerCase()}`);
  return 0;
}

function printNeigh(ctx: CommandContext, style: "ip" | "arp") {
  const entries = [...ctx.device.arp.entries()];
  if (!entries.length && style === "arp") ctx.print(ansi.dim("(tabel ARP kosong — belum pernah berkomunikasi dengan siapa pun)"));
  for (const [ip, e] of entries) {
    if (style === "ip") ctx.print(`${ip} dev ${e.iface} lladdr ${e.mac} ${e.static ? "PERMANENT" : "REACHABLE"}`);
    else ctx.print(`? (${ip}) at ${ansi.yellow(e.mac)} [ether]${e.static ? " PERM" : ""} on ${e.iface}`);
  }
  ctx.fact("arp:viewed");
}

export const netCommands: CommandDef[] = [
  {
    name: "ip",
    category: "jaringan",
    summary: "Melihat & mengatur alamat IP, routing, interface, dan ARP",
    usage: "ip addr | ip route | ip link | ip neigh   (contoh: ip addr add 192.168.1.10/24 dev eth0)",
    run(ctx) {
      const [obj, ...rest] = ctx.args;
      switch (obj) {
        case "a":
        case "addr":
        case "address":
          return ipAddrCmd(ctx, rest);
        case "r":
        case "route":
          return ipRouteCmd(ctx, rest);
        case "l":
        case "link":
          return ipLinkCmd(ctx, rest);
        case "n":
        case "neigh":
        case "neighbor":
          if (rest[0] === "flush" || rest[0] === "del") return flushNeigh(ctx, rest[1] === "dev" ? "all" : rest[1]);
          printNeigh(ctx, "ip");
          return 0;
        default:
          ctx.print("Penggunaan: ip [ addr | route | link | neigh ] ...");
          ctx.print("  ip a                                  tampilkan alamat IP");
          ctx.print("  ip route                              tampilkan tabel routing");
          ctx.print("  sudo ip addr add 10.0.0.5/24 dev eth0 tambahkan alamat IP");
          ctx.print("  sudo ip route add default via 10.0.0.1  atur default gateway");
          return obj ? 1 : 0;
      }
    },
  },
  {
    name: "ifconfig",
    category: "jaringan",
    summary: "Menampilkan konfigurasi interface (alat lama, versi baru: ip a)",
    usage: "ifconfig",
    run(ctx) {
      for (const iface of ctx.device.interfaces) {
        ctx.print(`${ansi.cyan(iface.name)}: flags=${iface.up ? "4163<UP,BROADCAST,RUNNING,MULTICAST>" : "4098<BROADCAST,MULTICAST>"}  mtu 1500`);
        if (iface.ip && iface.prefix !== undefined) {
          ctx.print(`        inet ${ansi.magenta(iface.ip)}  netmask ${prefixToMask(iface.prefix)}  broadcast ${broadcastAddress(iface.ip, iface.prefix)}`);
        }
        ctx.print(`        ether ${ansi.yellow(iface.mac)}  txqueuelen 1000  (Ethernet)`);
        ctx.print("");
      }
      ctx.print(`${ansi.cyan("lo")}: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536`);
      ctx.print(`        inet 127.0.0.1  netmask 255.0.0.0`);
      ctx.fact("ip:viewed");
      ctx.fact(`ip:viewed:${ctx.device.id}`);
    },
  },
  {
    name: "route",
    category: "jaringan",
    summary: "Menampilkan tabel routing (alat lama, versi baru: ip route)",
    usage: "route -n",
    run(ctx) {
      ctx.print("Kernel IP routing table");
      ctx.print("Destination     Gateway         Genmask         Flags Iface");
      const row = (dst: string, gw: string, mask: string, flags: string, iface: string) =>
        ctx.print(`${dst.padEnd(16)}${gw.padEnd(16)}${mask.padEnd(16)}${flags.padEnd(6)}${iface}`);
      for (const r of ctx.device.routes.filter((x) => x.prefix === 0)) {
        row("0.0.0.0", r.via, "0.0.0.0", "UG", ctx.net.lookupRoute(ctx.device, r.via)?.iface ?? "?");
      }
      for (const r of ctx.net.connectedRoutes(ctx.device)) row(r.network, "0.0.0.0", prefixToMask(r.prefix), "U", r.iface);
      for (const r of ctx.device.routes.filter((x) => x.prefix !== 0)) {
        row(r.network, r.via, prefixToMask(r.prefix), "UG", ctx.net.lookupRoute(ctx.device, r.via)?.iface ?? "?");
      }
      ctx.fact("route:viewed");
      ctx.fact(`route:viewed:${ctx.device.id}`);
    },
  },
  {
    name: "arp",
    category: "jaringan",
    summary: "Menampilkan tabel ARP (pemetaan IP → MAC)",
    usage: "arp -a | sudo arp -d <ip> | sudo arp -s <ip> <mac>",
    run(ctx) {
      const d = ctx.args.indexOf("-d");
      if (d >= 0) return flushNeigh(ctx, ctx.args[d + 1]);
      const st = ctx.args.indexOf("-s");
      if (st >= 0) return staticArp(ctx, ctx.args[st + 1], ctx.args[st + 2]);
      printNeigh(ctx, "arp");
    },
  },
  {
    name: "ping",
    category: "jaringan",
    summary: "Mengecek apakah host lain bisa dijangkau (ICMP Echo)",
    usage: "ping [-c jumlah] <host>",
    run(ctx) {
      const cIdx = ctx.args.indexOf("-c");
      const count = Math.min(Math.max(cIdx >= 0 ? Number(ctx.args[cIdx + 1]) || 4 : 4, 1), 10);
      const host = ctx.args.filter((_, i) => cIdx < 0 || (i !== cIdx && i !== cIdx + 1)).find((a) => !a.startsWith("-"));
      if (!host) {
        ctx.error("ping: usage error: Destination address required");
        return 1;
      }
      const dst = resolveHost(ctx, host);
      if (!dst) {
        ctx.error(`ping: ${host}: Temporary failure in name resolution`);
        return 2;
      }
      const srcIp = dst.startsWith("127.") ? "127.0.0.1" : ctx.net.sourceIpFor(ctx.device, dst);
      if (!srcIp) {
        ctx.error("ping: connect: Network is unreachable");
        ctx.fact(`ping:unreachable:${dst}`);
        return 2;
      }
      ctx.print(`PING ${host} (${dst}) 56(84) bytes of data.`);
      let received = 0;
      const id = ctx.net.nextIcmpId();
      for (let seq = 1; seq <= count; seq++) {
        const r = echoRequest(ctx.net, ctx.t, ctx.device, srcIp, dst, seq, 64, id);
        ctx.t = r.t;
        if (r.kind === "reply") {
          received++;
          ctx.print(`64 bytes from ${dst}: icmp_seq=${seq} ttl=${r.ttl} time=${fakeRtt(r.hops, seq)} ms`);
        } else if (r.kind === "unreachable") {
          const what = r.reason === "host" ? "Host" : r.reason === "net" ? "Net" : "Port";
          ctx.print(ansi.red(`From ${r.from} icmp_seq=${seq} Destination ${what} Unreachable`));
        } else if (r.kind === "ttl-exceeded") {
          ctx.print(ansi.yellow(`From ${r.from} icmp_seq=${seq} Time to live exceeded`));
        } else {
          ctx.t += HOP_MS * 2;
          ctx.print(ansi.dim(`Request timeout for icmp_seq ${seq}`));
        }
        ctx.t += 250;
      }
      const loss = Math.round(((count - received) / count) * 100);
      ctx.print("");
      ctx.print(`--- ${host} ping statistics ---`);
      const summary = `${count} packets transmitted, ${received} received, ${loss}% packet loss`;
      ctx.print(received === count ? ansi.green(summary) : received ? ansi.yellow(summary) : ansi.red(summary));
      ctx.fact(received ? `ping:ok:${dst}` : `ping:fail:${dst}`);
      ctx.fact(`${received ? "ping:ok" : "ping:fail"}:${ctx.device.id}>${dst}`);
      return received ? 0 : 1;
    },
  },
  {
    name: "traceroute",
    aliases: ["tracert"],
    category: "jaringan",
    summary: "Melacak jalur (router-router) yang dilewati paket menuju tujuan",
    usage: "traceroute <host>",
    run(ctx) {
      const host = ctx.args.find((a) => !a.startsWith("-"));
      if (!host) {
        ctx.error("Penggunaan: traceroute <host>");
        return 1;
      }
      const dst = resolveHost(ctx, host);
      if (!dst) {
        ctx.error(`${host}: Name or service not known`);
        return 2;
      }
      const srcIp = ctx.net.sourceIpFor(ctx.device, dst);
      if (!srcIp) {
        ctx.error("connect: Network is unreachable");
        return 2;
      }
      ctx.print(`traceroute to ${host} (${dst}), 30 hops max, 60 byte packets`);
      let misses = 0;
      const id = ctx.net.nextIcmpId();
      for (let ttl = 1; ttl <= 30; ttl++) {
        const r = echoRequest(ctx.net, ctx.t, ctx.device, srcIp, dst, ttl, ttl, id);
        ctx.t = r.t + 200;
        const n = String(ttl).padStart(2);
        if (r.kind === "reply" || r.kind === "ttl-exceeded") {
          misses = 0;
          const times = [0, 1, 2].map((k) => `${fakeRtt(r.hops, ttl + k)} ms`).join("  ");
          ctx.print(`${n}  ${ansi.cyan(r.from)} (${r.from})  ${times}`);
          if (r.kind === "reply") {
            ctx.fact(`traceroute:ok:${dst}`);
            return 0;
          }
        } else if (r.kind === "unreachable" && r.from !== srcIp) {
          const flag = r.reason === "net" ? "!N" : r.reason === "host" ? "!H" : "!P";
          ctx.print(`${n}  ${ansi.cyan(r.from)} (${r.from})  ${ansi.red(`${flag}  ${flag}  ${flag}`)}`);
          ctx.print(ansi.dim(`(${r.from} melaporkan: tidak tahu jalan ke ${dst})`));
          ctx.fact(`traceroute:stopped:${r.from}`);
          return 1;
        } else {
          ctx.t += HOP_MS * 2;
          ctx.print(`${n}  * * *`);
          if (++misses >= 3 || r.kind === "unreachable") {
            ctx.print(ansi.dim("(berhenti: tujuan tidak dapat dijangkau)"));
            return 1;
          }
        }
      }
      return 1;
    },
  },
];
