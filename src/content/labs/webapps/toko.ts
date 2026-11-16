import type { HttpRequest, HttpResponse } from "@/engine";
import { md5 } from "@/engine/crypto/hash";
import { createSqlApp, escapeHtml, isError, page, param, renderTable } from "@/engine/webapp/app";
import type { WebSpec } from "@/engine/topology";

export const TOKO_FLAG = "FLAG{union-select-membongkar-database}";

const NAV = `<a href="/">Beranda</a> <a href="/cari">Cari Produk</a> <a href="/login">Login</a> <a href="/v2/login">Login v2 (aman)</a>`;

const USERS: [number, string, string, string][] = [
  [1, "admin", "Sup3r-Rahasia!2026", "admin"],
  [2, "budi", "budi12345", "pelanggan"],
  [3, "sari", "kucingoren", "pelanggan"],
];

/** Fresh database + routes for toko.lab (a deliberately vulnerable shop). */
export function tokoWeb(): WebSpec {
  const app = createSqlApp({
    produk: {
      columns: ["id", "nama", "harga"],
      rows: [
        [1, "Kabel UTP Cat6 (per meter)", 5000],
        [2, "Switch 8 port", 250000],
        [3, "Router Wi-Fi", 450000],
        [4, "Konektor RJ-45 (isi 50)", 35000],
        [5, "Crimping tool", 85000],
      ],
    },
    users: { columns: ["id", "username", "password_md5", "peran"], rows: USERS.map(([id, u, p, r]) => [id, u, md5(p), r]) },
    rahasia_admin: { columns: ["catatan"], rows: [[`Kunci brankas kantor ada di laci 3. ${TOKO_FLAG}`]] },
  });

  const cari = (req: HttpRequest): HttpResponse => {
    const q = param(req, "q");
    const form = `<form action="/cari"><input name="q" value="${escapeHtml(q)}"> <button>Cari</button></form>`;
    if (!req.query.q && !req.form.q) return { body: page("Cari Produk", form, NAV) };
    // VULNERABLE: user input is concatenated straight into the SQL text.
    const res = app.query("/cari", `SELECT nama, harga FROM produk WHERE nama LIKE '%${q}%'`);
    if (isError(res)) {
      app.tag("sql-error");
      return { status: 500, body: page("Cari Produk", `${form}\n<p class="err">Database error: ${escapeHtml(res.error)}</p>`, NAV) };
    }
    const values = res.rows.flat().map((v) => String(v));
    if (values.some((v) => v.includes(TOKO_FLAG))) app.tag("flag-leaked");
    else if (values.some((v) => USERS.some(([, , p]) => v === md5(p)))) app.tag("users-leaked");
    else if (values.includes("rahasia_admin")) app.tag("schema-leaked");
    return { body: page("Cari Produk", `${form}\n<p>${res.rows.length} produk ditemukan.</p>\n${renderTable(res)}`, NAV) };
  };

  const loginForm = (action: string, msg = "") =>
    `${msg}<form method="POST" action="${action}">\nUsername: <input name="user"><br>\nPassword: <input name="pass" type="password"><br>\n<button>Masuk</button>\n</form>`;

  const login = (req: HttpRequest): HttpResponse => {
    if (req.method !== "POST") return { body: page("Login", loginForm("/login"), NAV) };
    const user = param(req, "user");
    const pass = param(req, "pass");
    // VULNERABLE: string concatenation. The password is hashed first, so only `user` is injectable.
    const res = app.query("/login", `SELECT username, peran FROM users WHERE username = '${user}' AND password_md5 = '${md5(pass)}'`);
    if (isError(res)) {
      app.tag("sql-error");
      return { status: 500, body: page("Login", `<p class="err">Database error: ${escapeHtml(res.error)}</p>`, NAV) };
    }
    if (!res.rows.length) return { status: 401, body: page("Login", loginForm("/login", `<p class="err">Username atau password salah.</p>`), NAV) };
    const [username, peran] = res.rows[0] as [string, string];
    const real = USERS.find(([, u]) => u === username);
    const legit = real && real[1] === user && real[2] === pass;
    if (!legit) app.tag(`login-bypass:${username}`);
    const adminArea = peran === "admin" ? `<div class="box"><b>Panel Admin</b><br>Omzet hari ini: Rp12.450.000<br>Kode akses gudang: GDG-4471</div>` : "";
    return { body: page("Login", `<p>Selamat datang, <b>${escapeHtml(username)}</b> (${escapeHtml(peran)})!</p>${adminArea}`, NAV) };
  };

  const loginV2 = (req: HttpRequest): HttpResponse => {
    if (req.method !== "POST") return { body: page("Login v2", loginForm("/v2/login"), NAV) };
    const user = param(req, "user");
    const pass = param(req, "pass");
    // SAFE: prepared statement — input is bound as data and can never change the query structure.
    const res = app.prepared("/v2/login", "SELECT username, peran FROM users WHERE username = ? AND password_md5 = ?", [user, md5(pass)]);
    if (isError(res)) return { status: 500, body: page("Login v2", `<p class="err">Terjadi kesalahan.</p>`, NAV) };
    if (!res.rows.length) {
      if (/['"]|--/.test(user)) app.tag("v2-blocked");
      return { status: 401, body: page("Login v2", loginForm("/v2/login", `<p class="err">Username atau password salah.</p>`), NAV) };
    }
    return { body: page("Login v2", `<p>Selamat datang, <b>${escapeHtml(String(res.rows[0][0]))}</b>!</p>`, NAV) };
  };

  return {
    software: "Apache/2.4.58 (Ubuntu) PHP/8.3.6",
    sqlLog: app.log,
    routes: {
      "/": { body: page("Toko Lab", `<p>Toko perlengkapan jaringan. Gunakan menu di atas.</p>`, NAV) },
      "/cari": cari,
      "/login": login,
      "/v2/login": loginV2,
    },
  };
}
