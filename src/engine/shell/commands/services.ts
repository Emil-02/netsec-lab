import type { AppData, DnsRecordType, HttpRequest } from "../../core/types";
import { applyLease, dhcpObtain } from "../../protocols/dhcp";
import { DNS_TYPES, dnsQuery, formatRecord, normalizeName, resolversOf } from "../../protocols/dns";
import { fakeCiphertext, formatRequestLines, formatResponseHead, handleHttp, parseForm, parseUrl, statusText } from "../../protocols/http";
import { tcpClose, tcpConnect, tcpSend, WELL_KNOWN_PORTS, type ConnectResult } from "../../protocols/transport";
import { FsError } from "../fs";
import { ansi, hasFlag, requireRoot, type CommandContext, type CommandDef } from "../types";
import { resolveHost } from "./net";

export const connectError = (r: Exclude<ConnectResult, { status: "open" }>) =>
  r.status === "refused"
    ? "Connection refused"
    : r.status === "timeout"
      ? "Connection timed out"
      : r.status === "eperm"
        ? "Operation not permitted"
        : r.reason === "net"
          ? "Network is unreachable"
          : "No route to host";

// ---------------- DNS tools ----------------

function pickServer(ctx: CommandContext, explicit?: string) {
  if (explicit) return explicit.replace(/^@/, "");
  return resolversOf(ctx.device)[0] ?? null;
}

function nslookup(ctx: CommandContext) {
  const [name, server] = ctx.args.filter((a) => !a.startsWith("-"));
  if (!name) {
    ctx.error("Penggunaan: nslookup <nama> [dns-server]");
    return 1;
  }
  const dns = pickServer(ctx, server);
  if (!dns) {
    ctx.error(";; tidak ada DNS server yang dikonfigurasi (cek /etc/resolv.conf)");
    ctx.fact("dns:no-resolver");
    return 1;
  }
  const res = dnsQuery(ctx.net, ctx.t, ctx.device, dns, name, "A");
  ctx.t = res.t;
  const q = normalizeName(name);
  if (res.status === "timeout" || res.status === "unreachable" || res.status === "refused") {
    ctx.print(`;; communications error to ${dns}#53: ${res.status === "refused" ? "connection refused" : "timed out"}`);
    ctx.print(ansi.red(";; no servers could be reached"));
    ctx.fact(`dns:timeout:${dns}`);
    return 1;
  }
  ctx.print(`Server:\t\t${dns}`);
  ctx.print(`Address:\t${dns}#53`);
  ctx.print("");
  if (res.status !== "NOERROR" || !res.answers.some((a) => a.type === "A")) {
    ctx.print(ansi.red(`** server can't find ${q}: ${res.status === "NOERROR" ? "NXDOMAIN" : res.status}`));
    ctx.fact(`dns:nxdomain:${q}`);
    return 1;
  }
  ctx.print("Non-authoritative answer:");
  for (const r of res.answers) {
    if (r.type === "CNAME") ctx.print(`${normalizeName(r.name)}\tcanonical name = ${r.value}.`);
    if (r.type === "A") {
      ctx.print(`Name:\t${normalizeName(r.name)}`);
      ctx.print(`Address: ${ansi.green(r.value)}`);
    }
  }
  ctx.fact(`dns:ok:${q}`);
  ctx.fact(`dns:ok:${q}:A`);
  ctx.fact(`dns:server:${dns}`);
  return 0;
}

function dig(ctx: CommandContext) {
  let server: string | undefined;
  let type: DnsRecordType = "A";
  let name: string | undefined;
  const short = ctx.args.includes("+short");
  for (const a of ctx.args) {
    if (a.startsWith("@")) server = a;
    else if (a.startsWith("+") || a.startsWith("-")) continue;
    else if (DNS_TYPES.includes(a.toUpperCase() as DnsRecordType) && name) type = a.toUpperCase() as DnsRecordType;
    else name = a;
  }
  if (!name) {
    ctx.error("Penggunaan: dig [@server] <nama> [A|MX|CNAME|TXT|NS] [+short]");
    return 1;
  }
  const dns = pickServer(ctx, server);
  if (!dns) {
    ctx.error(";; tidak ada DNS server yang dikonfigurasi (cek /etc/resolv.conf)");
    return 1;
  }
  const q = normalizeName(name);
  const res = dnsQuery(ctx.net, ctx.t, ctx.device, dns, q, type);
  ctx.t = res.t;
  if (res.status === "timeout" || res.status === "unreachable" || res.status === "refused") {
    ctx.print(ansi.red(`;; communications error to ${dns}#53: timed out`));
    ctx.print(ansi.red(";; no servers could be reached"));
    ctx.fact(`dns:timeout:${dns}`);
    return 9;
  }
  if (res.status === "NOERROR") {
    ctx.fact(`dns:ok:${q}:${type}`);
    if (type === "A") ctx.fact(`dns:ok:${q}`);
  } else ctx.fact(`dns:nxdomain:${q}`);
  ctx.fact(`dns:server:${dns}`);
  if (short) {
    for (const r of res.answers) ctx.print(r.type === "MX" ? `10 ${r.value}.` : r.type === "TXT" ? `"${r.value}"` : r.value);
    return 0;
  }
  ctx.print(`; <<>> DiG 9.18.24 <<>> ${ctx.args.join(" ")}`);
  ctx.print(";; global options: +cmd");
  ctx.print(";; Got answer:");
  const status = res.status === "NOERROR" ? ansi.green(res.status) : ansi.red(res.status);
  ctx.print(`;; ->>HEADER<<- opcode: QUERY, status: ${status}, id: ${4000 + (q.length * 37) % 900}`);
  ctx.print(`;; flags: qr rd ra; QUERY: 1, ANSWER: ${res.answers.length}, AUTHORITY: 0, ADDITIONAL: 1`);
  ctx.print("");
  ctx.print(ansi.yellow(";; QUESTION SECTION:"));
  ctx.print(`;${q}.\t\t\tIN\t${type}`);
  if (res.answers.length) {
    ctx.print("");
    ctx.print(ansi.yellow(";; ANSWER SECTION:"));
    for (const r of res.answers) ctx.print(formatRecord(r));
  }
  ctx.print("");
  ctx.print(`;; Query time: ${3 + (q.length % 7)} msec`);
  ctx.print(`;; SERVER: ${dns}#53(${dns}) (UDP)`);
  return res.status === "NOERROR" ? 0 : 1;
}

function hostCmd(ctx: CommandContext) {
  const [name, server] = ctx.args.filter((a) => !a.startsWith("-"));
  if (!name) {
    ctx.error("Penggunaan: host <nama> [dns-server]");
    return 1;
  }
  const dns = pickServer(ctx, server);
  if (!dns) {
    ctx.error(";; tidak ada DNS server yang dikonfigurasi");
    return 1;
  }
  const q = normalizeName(name);
  let found = false;
  for (const type of ["A", "MX"] as DnsRecordType[]) {
    const res = dnsQuery(ctx.net, ctx.t, ctx.device, dns, q, type);
    ctx.t = res.t;
    if (res.status === "timeout" || res.status === "unreachable" || res.status === "refused") {
      ctx.print(ansi.red(`;; connection timed out; no servers could be reached`));
      return 1;
    }
    if (res.status === "NXDOMAIN") {
      ctx.print(ansi.red(`Host ${q} not found: 3(NXDOMAIN)`));
      ctx.fact(`dns:nxdomain:${q}`);
      return 1;
    }
    for (const r of res.answers) {
      found = true;
      if (r.type === "A") ctx.print(`${normalizeName(r.name)} has address ${ansi.green(r.value)}`);
      if (r.type === "CNAME") ctx.print(`${normalizeName(r.name)} is an alias for ${r.value}.`);
      if (r.type === "MX") ctx.print(`${normalizeName(r.name)} mail is handled by 10 ${r.value}.`);
    }
  }
  if (found) ctx.fact(`dns:ok:${q}`);
  return found ? 0 : 1;
}

// ---------------- curl ----------------

interface CurlOptions {
  verbose: boolean;
  head: boolean;
  include: boolean;
  silent: boolean;
  follow: boolean;
  method?: string;
  data?: string;
  headers: [string, string][];
  output?: string;
  url?: string;
}

function parseCurl(args: string[]): CurlOptions | string {
  const o: CurlOptions = { verbose: false, head: false, include: false, silent: false, follow: false, headers: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => {
      const v = args[++i];
      if (v === undefined) throw new Error(`opsi ${a} butuh nilai`);
      return v;
    };
    try {
      if (a === "-v" || a === "--verbose") o.verbose = true;
      else if (a === "-I" || a === "--head") o.head = true;
      else if (a === "-i" || a === "--include") o.include = true;
      else if (a === "-s" || a === "--silent") o.silent = true;
      else if (a === "-L" || a === "--location") o.follow = true;
      else if (a === "-k" || a === "--insecure") continue;
      else if (a === "-X" || a === "--request") o.method = next().toUpperCase();
      else if (a === "-d" || a === "--data") o.data = o.data ? `${o.data}&${next()}` : next();
      else if (a === "-o" || a === "--output") o.output = next();
      else if (a === "-H" || a === "--header") {
        const h = next();
        const idx = h.indexOf(":");
        if (idx > 0) o.headers.push([h.slice(0, idx).trim(), h.slice(idx + 1).trim()]);
      } else if (/^-[a-zA-Z]{2,}$/.test(a)) {
        for (const f of a.slice(1)) {
          if (f === "v") o.verbose = true;
          else if (f === "I") o.head = true;
          else if (f === "i") o.include = true;
          else if (f === "s") o.silent = true;
          else if (f === "L") o.follow = true;
        }
      } else if (a.startsWith("-")) return `curl: opsi ${a} tidak dikenal`;
      else o.url = a;
    } catch (e) {
      return `curl: ${(e as Error).message}`;
    }
  }
  return o;
}

function curlOnce(ctx: CommandContext, o: CurlOptions, rawUrl: string, depth: number): number {
  const url = parseUrl(rawUrl);
  if (!url) {
    ctx.error(`curl: (3) URL rejected: ${rawUrl}`);
    return 3;
  }
  const v = (text: string) => o.verbose && ctx.print(ansi.dim(text));
  const ip = resolveHost(ctx, url.host);
  if (!ip) {
    ctx.error(`curl: (6) Could not resolve host: ${url.host}`);
    return 6;
  }
  v(`*   Trying ${ip}:${url.port}...`);
  const r = tcpConnect(ctx.net, ctx.t, ctx.device, ip, url.port);
  if (r.status !== "open") {
    ctx.t = r.t;
    const code = r.status === "timeout" ? 28 : 7;
    ctx.error(`curl: (${code}) Failed to connect to ${url.host} port ${url.port} after ${Math.round(r.t / 10)} ms: ${connectError(r)}`);
    ctx.fact(`curl:fail:${url.host}:${url.port}`);
    return code;
  }
  const conn = r.conn;
  v(`* Connected to ${url.host} (${ip}) port ${url.port}`);
  const secure = url.scheme === "https";

  if (secure) {
    if (conn.service.name !== "https") {
      tcpSend(ctx.net, conn, "client", { protocol: "TLS", summary: "Client Hello", data: `TLS 1.3 Client Hello\nSNI: ${url.host}` }, 517);
      tcpClose(ctx.net, conn);
      ctx.t = conn.t;
      ctx.error(`curl: (35) TLS connect error: server di port ${url.port} tidak berbicara TLS`);
      return 35;
    }
    v("* TLSv1.3 (OUT), TLS handshake, Client hello (1):");
    tcpSend(ctx.net, conn, "client", { protocol: "TLS", summary: "Client Hello", data: `TLS 1.3 Client Hello\nSNI (nama server): ${url.host}\nCipher suites: TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256` }, 517);
    v("* TLSv1.3 (IN), TLS handshake, Server hello (2):");
    v("* TLSv1.3 (IN), TLS handshake, Certificate (11):");
    tcpSend(ctx.net, conn, "server", { protocol: "TLS", summary: "Server Hello, Certificate, Finished", data: `Server Hello (TLS 1.3)\nSertifikat: CN=${url.host}\nPenerbit: NetSec Lab Root CA\nBerlaku sampai: 2027-12-31` }, 2380);
    v("* TLSv1.3 (OUT), TLS handshake, Finished (20):");
    tcpSend(ctx.net, conn, "client", { protocol: "TLS", summary: "Change Cipher Spec, Finished", data: "Kunci sesi telah disepakati. Mulai sekarang semua data dienkripsi." }, 80);
    v("* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384");
    v(`* Server certificate: subject: CN=${url.host}; issuer: CN=NetSec Lab Root CA`);
  }

  const method = o.method ?? (o.head ? "HEAD" : o.data !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = { Host: url.host, "User-Agent": "curl/8.5.0", Accept: "*/*" };
  for (const [k, val] of o.headers) headers[k] = val;
  const body = o.data ?? "";
  if (o.data !== undefined) {
    headers["Content-Type"] ??= "application/x-www-form-urlencoded";
    headers["Content-Length"] = String(body.length);
  }
  const req: HttpRequest = {
    method,
    path: url.path,
    query: url.query,
    headers,
    body,
    form: parseForm(body),
    clientIp: conn.seenIp,
    host: url.host,
    secure,
  };
  const reqLines = formatRequestLines(req, url.pathWithQuery);
  const reqText = `${reqLines.join("\r\n")}\r\n\r\n${body}`;
  for (const l of reqLines) v(`> ${l}`);
  v(">");
  const reqApp: AppData = secure
    ? { protocol: "TLS", summary: "Application Data (terenkripsi)", data: fakeCiphertext(reqText, reqText.length) }
    : { protocol: "HTTP", summary: `${method} ${url.pathWithQuery} HTTP/1.1`, data: reqText.replace(/\r/g, "") };
  tcpSend(ctx.net, conn, "client", reqApp, reqText.length);

  const res = handleHttp(conn.server, req);
  const head = formatResponseHead(res);
  const resText = `${head.join("\r\n")}\r\n\r\n${res.body}`;
  const shownBody = res.body.length > 700 ? `${res.body.slice(0, 700)}\n…(dipotong)` : res.body;
  const resApp: AppData = secure
    ? { protocol: "TLS", summary: "Application Data (terenkripsi)", data: fakeCiphertext(resText, resText.length) }
    : { protocol: "HTTP", summary: `HTTP/1.1 ${res.status} ${statusText(res.status)}`, data: `${head.join("\n")}\n\n${shownBody}` };
  tcpSend(ctx.net, conn, "server", resApp, resText.length);
  tcpClose(ctx.net, conn);
  ctx.t = conn.t;

  if (o.verbose) {
    for (const l of head) ctx.print(ansi.cyan(`< ${l}`));
    ctx.print(ansi.cyan("<"));
  } else if (o.head || o.include) {
    for (const l of head) ctx.print(l);
    ctx.print("");
  }
  const location = res.headers.find(([k]) => k.toLowerCase() === "location")?.[1];
  const key = `${url.host}${url.path}`;
  ctx.fact(`curl:${res.status}:${key}`);
  if (res.status < 400) ctx.fact(`curl:ok:${key}`);
  if (secure) ctx.fact(`curl:https:${key}`);
  if (method === "POST") ctx.fact(`curl:post:${secure ? "https" : "http"}:${key}`);
  if (o.verbose) ctx.fact("curl:verbose");
  if (o.head || o.include || o.verbose) ctx.fact("curl:headers");

  if (o.follow && location && res.status >= 300 && res.status < 400 && depth < 5) {
    v(`* Connection #${depth} to host ${url.host} left intact`);
    v(`* Issue another request to this URL: '${location}'`);
    const next = /^https?:\/\//.test(location) ? location : `${url.scheme}://${url.host}${url.port === (secure ? 443 : 80) ? "" : `:${url.port}`}${location}`;
    return curlOnce(ctx, o, next, depth + 1);
  }

  if (!o.head && res.body) {
    if (o.output) {
      const fs = ctx.device.fs;
      try {
        if (!fs) throw new FsError("sistem file tidak tersedia");
        const abs = fs.resolve(o.output, ctx.session.cwd);
        if (!fs.canWrite(abs, ctx.user, ctx.isRoot())) throw new FsError("Izin ditolak (Permission denied)");
        fs.writeFile(abs, res.body);
        ctx.fact(`write:${abs}`);
        if (!o.silent) ctx.print(ansi.dim(`  % Total    % Received  — ${res.body.length} byte disimpan ke ${o.output}`));
      } catch (err) {
        if (!(err instanceof FsError)) throw err;
        ctx.error(`curl: (23) Failure writing output to destination: ${err.message}`);
        return 23;
      }
    } else {
      ctx.print(res.body.replace(/\n$/, ""));
    }
  }
  v(`* Connection #${depth} to host ${url.host} left intact`);
  return 0;
}

function curl(ctx: CommandContext) {
  const o = parseCurl(ctx.args);
  if (typeof o === "string") {
    ctx.error(o);
    return 2;
  }
  if (!o.url) {
    ctx.error("curl: try 'curl --help' — contoh: curl http://web.lab/");
    return 2;
  }
  return curlOnce(ctx, o, o.url, 0);
}

// ---------------- netcat ----------------

function parsePorts(spec: string): number[] | null {
  const m = /^(\d+)(?:-(\d+))?$/.exec(spec);
  if (!m) return null;
  const from = Number(m[1]);
  const to = Number(m[2] ?? m[1]);
  if (from < 1 || to > 65535 || to < from) return null;
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

const MAX_NC_PORTS = 25;

function nc(ctx: CommandContext) {
  const zero = hasFlag(ctx.args, "-z");
  const verbose = hasFlag(ctx.args, "-v");
  if (hasFlag(ctx.args, "-u")) {
    ctx.error("nc: mode UDP belum didukung di lab ini");
    return 1;
  }
  if (hasFlag(ctx.args, "-l")) {
    ctx.error("nc: mode listen belum didukung di lab ini");
    return 1;
  }
  const [host, portSpec] = ctx.args.filter((a) => !a.startsWith("-"));
  const ports = portSpec ? parsePorts(portSpec) : null;
  if (!host || !ports) {
    ctx.error("Penggunaan: nc [-v] [-z] <host> <port>[-port]   contoh: nc -zv server 20-25");
    return 1;
  }
  if (ports.length > MAX_NC_PORTS) {
    ctx.error(`nc: maksimal ${MAX_NC_PORTS} port sekali jalan di lab ini (untuk scanning besar, nanti kita pakai nmap)`);
    return 1;
  }
  const ip = resolveHost(ctx, host);
  if (!ip) {
    ctx.error(`nc: getaddrinfo for host "${host}" port ${portSpec}: Name or service not known`);
    return 1;
  }
  let anyOpen = false;
  for (const port of ports) {
    const r = tcpConnect(ctx.net, ctx.t, ctx.device, ip, port);
    const svc = WELL_KNOWN_PORTS[port] ?? "*";
    if (r.status !== "open") {
      ctx.t = r.t;
      ctx.fact(`nc:${r.status === "refused" ? "refused" : "failed"}:${ip}:${port}`);
      if (verbose || ports.length === 1) {
        const verb = r.status === "timeout" ? "timed out: Operation now in progress" : `failed: ${connectError(r)}`;
        ctx.print(ansi.red(`nc: connect to ${host} (${ip}) port ${port} (tcp) ${verb}`));
      }
      continue;
    }
    anyOpen = true;
    const conn = r.conn;
    ctx.fact(`nc:open:${ip}:${port}`);
    if (verbose) ctx.print(ansi.green(`Connection to ${host} (${ip}) ${port} port [tcp/${svc}] succeeded!`));
    if (!zero) {
      if (conn.service.banner) {
        tcpSend(ctx.net, conn, "server", { protocol: conn.service.name === "ssh" ? "SSH" : "TCP", summary: `Banner: ${conn.service.banner}`, data: conn.service.banner }, conn.service.banner.length + 2);
        ctx.t = conn.t;
        ctx.print(conn.service.banner);
        ctx.fact(`nc:banner:${ip}:${port}`);
      }
      if (ctx.stdin) {
        const payload = ctx.stdin;
        const firstLine = payload.split("\n")[0];
        const httpLike = /^(GET|HEAD|POST) \S+ HTTP\/1\.[01]$/.test(firstLine.trim()) && conn.server.web;
        tcpSend(ctx.net, conn, "client", { protocol: httpLike ? "HTTP" : "TCP", summary: httpLike ? firstLine.trim() : `Data (${payload.length} byte)`, data: payload }, payload.length);
        if (httpLike) {
          const [method, path] = firstLine.trim().split(" ");
          const res = handleHttp(conn.server, { method, path, query: {}, headers: {}, body: "", form: {}, clientIp: conn.seenIp, host, secure: false });
          const text = `${formatResponseHead(res).join("\n")}\n\n${res.body}`;
          tcpSend(ctx.net, conn, "server", { protocol: "HTTP", summary: `HTTP/1.1 ${res.status} ${statusText(res.status)}`, data: text }, text.length);
          ctx.t = conn.t;
          ctx.print(text.replace(/\n$/, ""));
          ctx.fact(`nc:http:${ip}:${port}`);
        }
      }
    }
    tcpClose(ctx.net, conn);
    ctx.t = conn.t;
  }
  return anyOpen ? 0 : 1;
}

// ---------------- ss / netstat ----------------

function sockets(ctx: CommandContext, style: "ss" | "netstat") {
  const tcp = hasFlag(ctx.args, "-t");
  const udp = hasFlag(ctx.args, "-u");
  const numeric = hasFlag(ctx.args, "-n");
  const procs = hasFlag(ctx.args, "-p");
  const services = ctx.device.services.filter((s) => (!tcp && !udp) || (tcp && s.protocol === "tcp") || (udp && s.protocol === "udp"));
  const procName = (s: (typeof services)[number]) =>
    (s.name === "http" || s.name === "https") && ctx.device.web ? (ctx.device.web.software ?? "nginx").split("/")[0].toLowerCase() : s.name;
  const addr = (s: (typeof services)[number]) => `${s.bind ?? "0.0.0.0"}:${numeric ? s.port : (WELL_KNOWN_PORTS[s.port] ?? s.port)}`;
  if (style === "ss") {
    ctx.print(ansi.bold(`${"Netid".padEnd(6)} ${"State".padEnd(7)} ${"Recv-Q".padEnd(6)} ${"Send-Q".padEnd(6)} ${"Local Address:Port".padStart(22)}  ${"Peer Address:Port".padEnd(18)}${procs ? " Process" : ""}`));
    for (const s of services) {
      const state = s.protocol === "tcp" ? "LISTEN" : "UNCONN";
      const proc = procs ? ` users:(("${procName(s)}",pid=${1000 + s.port % 997},fd=3))` : "";
      ctx.print(`${s.protocol.padEnd(6)} ${state.padEnd(7)} ${"0".padEnd(6)} ${"128".padEnd(6)} ${addr(s).padStart(22)}  ${"0.0.0.0:*".padEnd(18)}${proc}`);
    }
  } else {
    ctx.print("Active Internet connections (only servers)");
    ctx.print(ansi.bold(`Proto Recv-Q Send-Q ${"Local Address".padEnd(22)} ${"Foreign Address".padEnd(18)} State${procs ? "       PID/Program name" : ""}`));
    for (const s of services) {
      const state = s.protocol === "tcp" ? "LISTEN" : "";
      ctx.print(`${s.protocol.padEnd(5)} ${"0".padStart(6)} ${"0".padStart(6)} ${addr(s).padEnd(22)} ${"0.0.0.0:*".padEnd(18)} ${state.padEnd(11)}${procs ? ` ${1000 + s.port % 997}/${procName(s)}` : ""}`);
    }
  }
  if (!services.length) ctx.print(ansi.dim("(tidak ada layanan yang sedang mendengarkan)"));
  ctx.fact("ss:viewed");
  ctx.fact(`ss:viewed:${ctx.device.id}`);
  return 0;
}

// ---------------- dhclient ----------------

function dhclient(ctx: CommandContext) {
  if (!requireRoot(ctx, "dhclient")) return 1;
  const release = hasFlag(ctx.args, "-r");
  const ifaceName = ctx.args.find((a) => !a.startsWith("-")) ?? ctx.device.interfaces[0]?.name;
  const iface = ctx.device.interfaces.find((i) => i.name === ifaceName);
  if (!iface) {
    ctx.error(`dhclient: interface "${ifaceName ?? ""}" tidak ditemukan`);
    return 1;
  }
  if (release) {
    iface.ip = undefined;
    iface.prefix = undefined;
    ctx.device.routes = ctx.device.routes.filter((r) => r.prefix !== 0);
    ctx.device.dhcpLease = undefined;
    ctx.fact(`dhcp:released:${iface.name}`);
    return 0;
  }
  if (!iface.up) {
    ctx.error(`dhclient: ${iface.name} sedang DOWN. Nyalakan dulu dengan: sudo ip link set ${iface.name} up`);
    return 1;
  }
  const verbose = hasFlag(ctx.args, "-v");
  if (verbose) {
    ctx.print(`Listening on LPF/${iface.name}/${iface.mac}`);
    ctx.print(`Sending on   LPF/${iface.name}/${iface.mac}`);
  }
  const res = dhcpObtain(ctx.net, ctx.t, ctx.device, iface.name);
  for (const line of res.log) if (verbose || line.text.startsWith("No DHCP")) ctx.printAt(line.at, line.text);
  ctx.t = res.t;
  if (res.status !== "bound") {
    ctx.fact(`dhcp:fail:${iface.name}`);
    return 2;
  }
  applyLease(ctx.device, iface.name, res.lease);
  if (verbose) ctx.print(ansi.green(`bound to ${res.lease.ip} -- renewal in 43200 seconds.`));
  ctx.fact(`dhcp:bound:${iface.name}:${res.lease.ip}`);
  return 0;
}

// ---------------- tee ----------------

function tee(ctx: CommandContext) {
  const append = hasFlag(ctx.args, "-a");
  const input = ctx.stdin ?? "";
  const fs = ctx.device.fs;
  let code = 0;
  for (const file of ctx.args.filter((a) => !a.startsWith("-"))) {
    try {
      if (!fs) throw new FsError("sistem file tidak tersedia");
      const abs = fs.resolve(file, ctx.session.cwd);
      if (!fs.canWrite(abs, ctx.user, ctx.isRoot())) throw new FsError("Izin ditolak (Permission denied)");
      fs.writeFile(abs, input, ctx.isRoot() ? "root" : ctx.user, append);
      ctx.fact(`write:${abs}`);
    } catch (err) {
      if (!(err instanceof FsError)) throw err;
      ctx.error(`tee: ${file}: ${err.message}`);
      code = 1;
    }
  }
  if (input) ctx.print(input.replace(/\n$/, ""));
  return code;
}

export const serviceCommands: CommandDef[] = [
  { name: "nslookup", category: "jaringan", summary: "Menanyakan alamat IP sebuah nama domain ke DNS server", usage: "nslookup <nama> [dns-server]", run: nslookup },
  { name: "dig", category: "jaringan", summary: "Alat query DNS yang detail (A, MX, CNAME, TXT, NS)", usage: "dig [@server] <nama> [tipe] [+short]", run: dig },
  { name: "host", category: "jaringan", summary: "Query DNS singkat", usage: "host <nama> [dns-server]", run: hostCmd },
  { name: "curl", category: "jaringan", summary: "Mengirim request HTTP/HTTPS ke web server", usage: "curl [-v] [-I] [-i] [-L] [-d data] [-X METHOD] [-H 'K: V'] [-o file] <url>", run: curl },
  { name: "nc", aliases: ["netcat"], category: "jaringan", summary: "Netcat: membuka koneksi TCP ke port tertentu", usage: "nc [-v] [-z] <host> <port>[-port]", run: nc },
  { name: "ss", category: "jaringan", summary: "Menampilkan port yang sedang listening di perangkat ini", usage: "ss -tuln [-p]", run: (ctx) => sockets(ctx, "ss") },
  { name: "netstat", category: "jaringan", summary: "Versi lama dari ss", usage: "netstat -tuln [-p]", run: (ctx) => sockets(ctx, "netstat") },
  { name: "dhclient", category: "jaringan", summary: "Meminta alamat IP otomatis dari DHCP server", usage: "sudo dhclient [-v] [-r] <interface>", run: dhclient },
  { name: "tee", category: "teks", summary: "Menulis input ke file sekaligus ke layar (bisa dipakai dengan sudo)", usage: "echo teks | sudo tee [-a] <file>", run: tee },
];
