import type { LabContext, LabDefinition } from "@/engine";
import { BASIC_COMMANDS, has, recent } from "./helpers";
import { entryHasScript, forumEntries, forumWeb } from "./webapps/forum";
import { tokoWeb } from "./webapps/toko";

const WEB_COMMANDS = [...BASIC_COMMANDS, "ping", "curl", "browser", "nslookup"];

export function sqlTag(ctx: LabContext, deviceId: string, prefix: string) {
  return (ctx.net.device(deviceId).web?.sqlLog ?? []).some((q) => q.tag?.startsWith(prefix));
}

function client(id: string, hosts: Record<string, string>) {
  return { id, name: "Laptop Kamu", hostname: "laptop", kind: "laptop" as const, position: { x: 0, y: 120 }, interfaces: [{ name: "eth0", ip: "10.0.0.10/24" }], hosts };
}

export const sqliLab: LabDefinition = {
  id: "sql-injection",
  title: "SQL Injection di Toko Lab",
  summary: "Lihat bagaimana input pengguna mengubah query SQL: dari error, login tanpa password, sampai membongkar isi database — lalu bandingkan dengan versi yang aman.",
  difficulty: "mahir",
  estimatedMinutes: 30,
  xp: 220,
  controllable: ["laptop"],
  allowedCommands: WEB_COMMANDS,
  briefing: [
    "**toko.lab** adalah aplikasi web latihan yang sengaja dibuat rentan. Pemiliknya (kamu sendiri!) ingin tahu seberapa parah dampaknya sebelum aplikasi sungguhan dirilis.",
    "Klik ikon **toko.lab** di peta untuk melihat *Log query database*: setiap query yang dijalankan aplikasi akan muncul di sana. Perhatikan bagaimana input kamu masuk ke dalam query.",
  ],
  topology: {
    devices: [
      client("laptop", { "toko.lab": "10.0.0.80" }),
      { id: "sw", name: "Switch", kind: "switch", position: { x: 240, y: 120 } },
      { id: "web", name: "toko.lab", hostname: "toko", kind: "server", position: { x: 480, y: 120 }, interfaces: [{ name: "eth0", ip: "10.0.0.80/24" }], web: tokoWeb },
    ],
    links: [
      ["laptop:eth0", "sw:p1"],
      ["web:eth0", "sw:p2"],
    ],
  },
  objectives: [
    { id: "normal", text: "Cari produk secara normal: `browser \"http://toko.lab/cari?q=kabel\"`, lalu lihat query-nya di log (klik ikon toko.lab)", check: (ctx) => has("browser:ok:toko.lab/cari")(ctx) || has("curl:ok:toko.lab/cari")(ctx) },
    { id: "error", text: "Masukkan satu tanda kutip `'` sebagai kata kunci. Aplikasi menampilkan **error SQL** — tanda bahwa input masuk mentah ke query", check: (ctx) => sqlTag(ctx, "web", "sql-error") },
    {
      id: "bypass",
      text: "Login sebagai **admin** tanpa tahu password-nya: kirim form `/login` dengan `curl -d \"user=...&pass=...\"` dan manipulasi field `user`",
      check: (ctx) => sqlTag(ctx, "web", "login-bypass:admin"),
    },
    { id: "schema", text: "Lewat pencarian, gunakan `UNION SELECT` untuk menampilkan daftar nama tabel dari `information_schema.tables`", check: (ctx) => sqlTag(ctx, "web", "schema-leaked") },
    { id: "flag", text: "Tampilkan isi tabel rahasia yang kamu temukan dan dapatkan FLAG", check: (ctx) => sqlTag(ctx, "web", "flag-leaked") },
    { id: "fix", text: "Coba trik login yang sama ke `/v2/login` (memakai *prepared statement*). Gagal, kan? Lihat bedanya di log query", check: (ctx) => sqlTag(ctx, "web", "v2-blocked") },
  ],
  hints: [
    "Query pencarian di server kira-kira: `SELECT nama, harga FROM produk WHERE nama LIKE '%INPUT%'`. Satu kutip `'` menutup string terlalu cepat sehingga sintaksnya rusak.",
    "Login: `curl -d \"user=admin' -- &pass=bebas\" http://toko.lab/login`. Tanda `--` membuat sisa query (pengecekan password) menjadi komentar.",
    "UNION butuh jumlah kolom yang sama (2 kolom). Contoh: `browser \"http://toko.lab/cari?q=x' UNION SELECT table_name, table_schema FROM information_schema.tables -- \"`. Lalu cari nama kolomnya dengan `UNION SELECT column_name, table_name FROM information_schema.columns -- `, dan terakhir `UNION SELECT <kolom>, 1 FROM <tabel> -- `.",
  ],
};

function forumEntriesOf(ctx: LabContext) {
  return forumEntries(ctx.net.device("forum").web?.state);
}

export const xssLab: LabDefinition = {
  id: "xss",
  title: "Cross-Site Scripting di Forum Lab",
  summary: "Sisipkan HTML & skrip ke halaman forum (reflected dan stored XSS), lalu buktikan bahwa escaping output menutup celahnya.",
  difficulty: "mahir",
  estimatedMinutes: 25,
  xp: 200,
  controllable: ["laptop"],
  allowedCommands: WEB_COMMANDS,
  briefing: [
    "**forum.lab** menampilkan kembali apa pun yang ditulis pengguna — tanpa menyaring HTML. Di lab ini kamu akan melihat dampaknya lewat **browser simulasi** (tab *Browser*).",
    "Browser lab **tidak pernah menjalankan skrip** sungguhan; ia hanya menampilkan peringatan berisi skrip yang *akan* dijalankan oleh browser asli. Pakai tombol *Sumber* untuk melihat HTML mentahnya.",
  ],
  topology: {
    devices: [
      client("laptop", { "forum.lab": "10.0.0.81" }),
      { id: "sw", name: "Switch", kind: "switch", position: { x: 240, y: 120 } },
      { id: "forum", name: "forum.lab", hostname: "forum", kind: "server", position: { x: 480, y: 120 }, interfaces: [{ name: "eth0", ip: "10.0.0.81/24" }], web: forumWeb },
    ],
    links: [
      ["laptop:eth0", "sw:p1"],
      ["forum:eth0", "sw:p2"],
    ],
  },
  objectives: [
    { id: "visit", text: "Buka buku tamu: `browser http://forum.lab/buku-tamu`", check: has("browser:ok:forum.lab/buku-tamu") },
    {
      id: "html",
      text: "Uji pencarian dengan HTML biasa: `browser \"http://forum.lab/cari?q=<b>tebal</b>\"`. Apakah teksnya tampil tebal?",
      check: has("browser:ok:forum.lab/cari"),
    },
    { id: "reflected", text: "**Reflected XSS**: masukkan tag `<script>` ke parameter `q` dan lihat peringatan di browser", check: has("browser:script:forum.lab/cari") },
    {
      id: "stored",
      text: "**Stored XSS**: kirim pesan berisi skrip ke buku tamu dengan `curl -d \"nama=...&pesan=...\" http://forum.lab/buku-tamu`",
      check: (ctx) => forumEntriesOf(ctx).some((e) => e.version === "v1" && entryHasScript(e)),
    },
    { id: "victim", text: "Buka lagi `/buku-tamu` di browser — skrip itu kini menyerang **setiap** pengunjung", requires: ["stored"], check: recent("browser:script:forum.lab/buku-tamu") },
    {
      id: "fixed",
      text: "Kirim pesan yang sama ke `/v2/buku-tamu`, lalu buka halamannya: skrip tampil sebagai teks biasa",
      check: (ctx) => forumEntriesOf(ctx).some((e) => e.version === "v2" && entryHasScript(e)) && ctx.recent.has("browser:ok:forum.lab/v2/buku-tamu") && !ctx.recent.has("browser:script:forum.lab/v2/buku-tamu"),
    },
  ],
  hints: [
    "Gunakan tanda kutip ganda di sekitar URL agar karakter `<` dan `>` tidak diartikan shell sebagai redirect.",
    "Payload klasik untuk uji: `<script>alert(1)</script>` atau `<img src=x onerror=alert(1)>`.",
    "Contoh stored: `curl -d \"nama=Iseng&pesan=<script>alert(1)</script>\" http://forum.lab/buku-tamu`. Klik tombol *Sumber* di tab Browser untuk membandingkan HTML v1 dan v2 (`&lt;script&gt;`).",
  ],
};
