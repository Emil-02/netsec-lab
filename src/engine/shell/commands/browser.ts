import type { HttpRequest } from "../../core/types";
import { formatRequestLines, handleHttp, parseForm, parseUrl, statusText, fakeCiphertext, formatResponseHead } from "../../protocols/http";
import { tcpClose, tcpConnect, tcpSend } from "../../protocols/transport";
import { findExecutableScript } from "../../webapp/app";
import { ansi, type CommandContext, type CommandDef } from "../types";
import { resolveHost } from "./net";
import { connectError } from "./services";

const MAX_REDIRECTS = 3;

/** Fetches a page like a browser would (GET, follows redirects) and shows it in the Browser tab. */
function openPage(ctx: CommandContext, rawUrl: string, depth: number): number {
  const url = parseUrl(rawUrl);
  if (!url) {
    ctx.error(`browser: URL tidak valid: ${rawUrl}`);
    return 1;
  }
  const ip = resolveHost(ctx, url.host);
  if (!ip) {
    ctx.error(`browser: Server tidak ditemukan (${url.host})`);
    return 1;
  }
  const r = tcpConnect(ctx.net, ctx.t, ctx.device, ip, url.port);
  if (r.status !== "open") {
    ctx.t = r.t;
    ctx.error(`browser: Tidak bisa terhubung ke ${url.host}:${url.port} (${connectError(r)})`);
    return 1;
  }
  const conn = r.conn;
  const secure = url.scheme === "https";
  const req: HttpRequest = {
    method: "GET",
    path: url.path,
    query: url.query,
    headers: { Host: url.host, "User-Agent": "Mozilla/5.0 (NetSecLab Browser)", Accept: "text/html" },
    body: "",
    form: parseForm(""),
    clientIp: conn.seenIp,
    host: url.host,
    secure,
  };
  const reqText = `${formatRequestLines(req, url.pathWithQuery).join("\n")}\n\n`;
  tcpSend(
    ctx.net,
    conn,
    "client",
    secure ? { protocol: "TLS", summary: "Application Data (terenkripsi)", data: fakeCiphertext(reqText) } : { protocol: "HTTP", summary: `GET ${url.pathWithQuery} HTTP/1.1`, data: reqText },
    reqText.length,
  );
  const res = handleHttp(conn.server, req);
  const head = formatResponseHead(res).join("\n");
  tcpSend(
    ctx.net,
    conn,
    "server",
    secure
      ? { protocol: "TLS", summary: "Application Data (terenkripsi)", data: fakeCiphertext(head + res.body) }
      : { protocol: "HTTP", summary: `HTTP/1.1 ${res.status} ${statusText(res.status)}`, data: `${head}\n\n${res.body.slice(0, 700)}` },
    head.length + res.body.length,
  );
  tcpClose(ctx.net, conn);
  ctx.t = conn.t;

  const location = res.headers.find(([k]) => k.toLowerCase() === "location")?.[1];
  if (location && res.status >= 300 && res.status < 400 && depth < MAX_REDIRECTS) {
    ctx.print(ansi.dim(`→ ${res.status} dialihkan ke ${location}`));
    const next = /^https?:\/\//.test(location) ? location : `${url.scheme}://${url.host}${url.port === (secure ? 443 : 80) ? "" : `:${url.port}`}${location}`;
    return openPage(ctx, next, depth + 1);
  }

  const shownUrl = `${url.scheme}://${url.host}${url.port === (secure ? 443 : 80) ? "" : `:${url.port}`}${url.pathWithQuery}`;
  const scripts = findExecutableScript(res.body);
  ctx.net.showPage(ctx.t, { url: shownUrl, status: res.status, html: res.body, scripts });
  ctx.print(`${ansi.cyan("🌐")} ${shownUrl} ${ansi.dim(`(${res.status} ${statusText(res.status)})`)} — lihat tab ${ansi.bold("Browser")}`);
  ctx.fact(`browser:open:${url.host}${url.path}`);
  if (res.status < 400) ctx.fact(`browser:ok:${url.host}${url.path}`);
  if (scripts.length) {
    ctx.print(ansi.yellow(`⚠ Halaman ini berisi skrip yang akan dijalankan browser: ${scripts[0].slice(0, 60)}`));
    ctx.fact(`browser:script:${url.host}${url.path}`);
  }
  return res.status < 400 ? 0 : 1;
}

export const browserCommand: CommandDef = {
  name: "browser",
  aliases: ["firefox"],
  category: "jaringan",
  summary: "Membuka halaman web di browser simulasi (tab Browser)",
  usage: 'browser <url>   contoh: browser "http://toko.lab/cari?q=kabel"',
  run(ctx) {
    const url = ctx.args.find((a) => !a.startsWith("-"));
    if (!url) {
      ctx.error('Penggunaan: browser <url>   contoh: browser "http://toko.lab/"');
      return 1;
    }
    return openPage(ctx, url, 0);
  },
};
