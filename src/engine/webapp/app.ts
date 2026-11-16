import type { HttpRequest, HttpResponse, SqlLogEntry } from "../core/types";
import { runQuery, SqlError, type Database, type QueryResult, type Value } from "./sql";

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Wraps page content in a small, consistent HTML layout. */
export function page(title: string, body: string, nav = ""): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;margin:16px;color:#111}nav a{margin-right:8px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}.err{color:#b00020;font-family:monospace}.box{border:1px solid #ddd;padding:8px;margin:6px 0;border-radius:6px}</style>
</head>
<body>
${nav ? `<nav>${nav}</nav>\n` : ""}<h1>${title}</h1>
${body}
</body>
</html>
`;
}

export interface SqlApp {
  db: Database;
  log: SqlLogEntry[];
  /** Runs a query exactly as given — vulnerable when built by string concatenation. */
  query(path: string, sql: string): QueryResult | { error: string };
  /** Prepared statement: `?` placeholders are bound as data. */
  prepared(path: string, sql: string, params: Value[]): QueryResult | { error: string };
}

export function createSqlApp(db: Database): SqlApp {
  const log: SqlLogEntry[] = [];
  const exec = (path: string, sql: string, params?: Value[]) => {
    try {
      const res = runQuery(db, sql, params ?? []);
      log.push({ path, sql, params: params?.map(String), ok: true, rows: res.rows.length });
      return res;
    } catch (err) {
      if (!(err instanceof SqlError)) throw err;
      log.push({ path, sql, params: params?.map(String), ok: false, error: err.message });
      return { error: err.message };
    }
  };
  return {
    db,
    log,
    query: (path, sql) => exec(path, sql),
    prepared: (path, sql, params) => exec(path, sql, params),
  };
}

export function isError(r: QueryResult | { error: string }): r is { error: string } {
  return "error" in r;
}

export function renderTable(r: QueryResult) {
  const head = r.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const body = r.rows.map((row) => `<tr>${row.map((v) => `<td>${escapeHtml(String(v ?? "NULL"))}</td>`).join("")}</tr>`).join("\n");
  return `<table>\n<tr>${head}</tr>\n${body}\n</table>`;
}

/** Reads a request parameter from the query string or the POSTed form. */
export function param(req: HttpRequest, name: string) {
  return req.form[name] ?? req.query[name] ?? "";
}

export function redirect(location: string): HttpResponse {
  return { status: 302, headers: { Location: location }, body: "" };
}

/**
 * Heuristic used by the simulated browser: does this HTML contain script that a
 * real browser would execute? (inline <script>, event handlers, javascript: URLs)
 */
export function findExecutableScript(html: string): string[] {
  const found: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) found.push(m[1].trim() || m[0]);
  for (const m of html.matchAll(/<[a-z][^>]*\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi)) found.push(`${m[1]}=${m[2].replace(/^["']|["']$/g, "")}`);
  for (const m of html.matchAll(/(?:href|src)\s*=\s*["']?\s*javascript:([^"'>\s]+)/gi)) found.push(`javascript:${m[1]}`);
  return found;
}
