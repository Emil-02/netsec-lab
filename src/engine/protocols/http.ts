import type { Device, HttpRequest, HttpResponse } from "../core/types";

export interface ParsedUrl {
  scheme: "http" | "https";
  host: string;
  port: number;
  path: string;
  query: Record<string, string>;
  pathWithQuery: string;
}

export function parseUrl(raw: string): ParsedUrl | null {
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`;
  const m = /^(https?):\/\/([^/:?#]+)(?::(\d+))?([^?#]*)(\?[^#]*)?/i.exec(withScheme);
  if (!m) return null;
  const scheme = m[1].toLowerCase() as "http" | "https";
  const path = m[4] || "/";
  const search = m[5] ?? "";
  return {
    scheme,
    host: m[2].toLowerCase(),
    port: m[3] ? Number(m[3]) : scheme === "https" ? 443 : 80,
    path,
    query: parseForm(search.slice(1)),
    pathWithQuery: path + search,
  };
}

export function parseForm(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of body.split("&")) {
    if (!pair) continue;
    const [k, v = ""] = pair.split("=");
    try {
      out[decodeURIComponent(k.replace(/\+/g, " "))] = decodeURIComponent(v.replace(/\+/g, " "));
    } catch {
      out[k] = v;
    }
  }
  return out;
}

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  500: "Internal Server Error",
};

export function statusText(code: number) {
  return STATUS_TEXT[code] ?? "";
}

export interface BuiltResponse {
  status: number;
  headers: [string, string][];
  body: string;
}

const NOT_FOUND = (path: string) =>
  `<html>\n<head><title>404 Not Found</title></head>\n<body>\n<h1>404 Not Found</h1>\n<p>Halaman ${path} tidak ada di server ini.</p>\n</body>\n</html>\n`;

/** Routes a request to the device's web config and fills in standard headers. */
export function handleHttp(server: Device, req: HttpRequest): BuiltResponse {
  const route = server.web?.routes[req.path];
  let res: HttpResponse;
  if (!route) res = { status: 404, body: NOT_FOUND(req.path) };
  else res = typeof route === "function" ? route(req) : route;

  const status = res.status ?? 200;
  const body = req.method === "HEAD" ? "" : (res.body ?? "");
  const fullBody = res.body ?? "";
  const headers: [string, string][] = [
    ["Server", server.web?.software ?? "nginx/1.24.0"],
    ["Date", "Sun, 16 Nov 2026 01:00:00 GMT"],
    ["Content-Type", res.contentType ?? (fullBody.trimStart().startsWith("<") ? "text/html; charset=utf-8" : "text/plain; charset=utf-8")],
    ["Content-Length", String(new TextEncoder().encode(fullBody).length)],
    ["Connection", "keep-alive"],
    ...Object.entries(res.headers ?? {}),
  ];
  return { status, headers, body };
}

export function formatRequestLines(req: HttpRequest, pathWithQuery: string): string[] {
  return [
    `${req.method} ${pathWithQuery} HTTP/1.1`,
    ...Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`),
  ];
}

export function formatResponseHead(res: BuiltResponse): string[] {
  return [`HTTP/1.1 ${res.status} ${statusText(res.status)}`, ...res.headers.map(([k, v]) => `${k}: ${v}`)];
}

/** Deterministic hex "ciphertext" so encrypted traffic looks believable but stable. */
export function fakeCiphertext(seed: string, bytes = 48) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out: string[] = [];
  for (let i = 0; i < Math.min(bytes, 96); i++) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    out.push((h & 0xff).toString(16).padStart(2, "0"));
  }
  return out.join(" ").replace(/((?:\S+ ){16})/g, "$1\n");
}
