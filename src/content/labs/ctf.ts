import type { HttpRequest, HttpResponse, LabContext, LabDefinition } from "@/engine";
import { base64Encode, md5, sha256 } from "@/engine/crypto/hash";
import { createSqlApp, escapeHtml, isError, page, param } from "@/engine/webapp/app";
import type { WebSpec } from "@/engine/topology";
import { BASIC_COMMANDS, NET_COMMANDS } from "./helpers";

const FLAGS = {
  pemanasan: "FLAG{base64-bukan-enkripsi}",
  dns: "FLAG{dns-txt-bisa-menyimpan-apa-saja}",
  robots: "FLAG{robots-txt-adalah-peta-harta-karun}",
  port: "FLAG{selalu-scan-semua-port}",
  sqli: "FLAG{prepared-statement-menyelamatkan}",
  hash: "FLAG{garuda2026}",
};

const CHALLENGES: { id: keyof typeof FLAGS; title: string; points: number }[] = [
  { id: "pemanasan", title: "Pemanasan", points: 50 },
  { id: "dns", title: "Pesan di DNS", points: 100 },
  { id: "robots", title: "Jangan Diindeks", points: 100 },
  { id: "port", title: "Pintu Belakang", points: 150 },
  { id: "hash", title: "Hash Bocor", points: 150 },
  { id: "sqli", title: "Admin Tanpa Password", points: 200 },
];

const WORDLIST = ["123456", "password", "qwerty", "indonesia", "merdeka", "garuda", "garuda123", "garuda2025", "garuda2026", "bismillah", "sayang", "rahasia", "admin", "letmein", "welcome", "jakarta2026", "pancasila", "nusantara"];

const README = `=== NetSec Lab CTF Mini ===
Target: jaringan 10.20.0.0/24 (domain ctf.lab). Semua host di jaringan ini BOLEH diuji.
Kirim setiap flag dengan:  submit-flag FLAG{...}

1. Pemanasan (50)        : pesan di bawah ini sudah "diamankan". Benarkah?
   ${base64Encode(`Selamat datang! Flag pertamamu: ${FLAGS.pemanasan}`)}
2. Pesan di DNS (100)    : server DNS ctf.lab menyimpan sesuatu selain alamat IP.
3. Jangan Diindeks (100) : portal.ctf.lab punya halaman yang tidak ingin ditemukan mesin pencari.
4. Pintu Belakang (150)  : salah satu host menjalankan layanan di port yang tidak biasa.
5. Hash Bocor (150)      : ~/bocoran/hash.txt berisi hash password admin lama. Flag = FLAG{password}
6. Admin Tanpa Password (200): masuk ke portal.ctf.lab/login sebagai admin.
`;

function portalWeb(): WebSpec {
  const app = createSqlApp({
    akun: {
      columns: ["username", "password_md5", "peran"],
      rows: [
        ["admin", md5("T4kAkanP3rnahTerteb4k!"), "admin"],
        ["tamu", md5("tamu"), "tamu"],
      ],
    },
  });
  const nav = `<a href="/">Beranda</a> <a href="/login">Login</a>`;
  const login = (req: HttpRequest): HttpResponse => {
    const form = `<form method="POST" action="/login">User: <input name="user"> Pass: <input name="pass" type="password"> <button>Masuk</button></form>`;
    if (req.method !== "POST") return { body: page("Login Portal", form, nav) };
    const res = app.query("/login", `SELECT username, peran FROM akun WHERE username = '${param(req, "user")}' AND password_md5 = '${md5(param(req, "pass"))}'`);
    if (isError(res)) return { status: 500, body: page("Login Portal", `<p class="err">${escapeHtml(res.error)}</p>`, nav) };
    if (!res.rows.length) return { status: 401, body: page("Login Portal", `<p class="err">Login gagal.</p>${form}`, nav) };
    const [user, role] = res.rows[0].map(String);
    const secret = role === "admin" ? `<div class="box">Catatan admin: ${FLAGS.sqli}</div>` : "";
    return { body: page("Login Portal", `<p>Halo, ${escapeHtml(user)}!</p>${secret}`, nav) };
  };
  return {
    software: "Apache/2.4.58 (Ubuntu) PHP/8.3.6",
    sqlLog: app.log,
    routes: {
      "/": { body: page("Portal ctf.lab", "<p>Portal internal. Silakan login.</p>", nav) },
      "/robots.txt": { body: "User-agent: *\nDisallow: /arsip-2019/\n" },
      "/arsip-2019/": { body: page("Arsip 2019", `<p>Arsip lama yang lupa dihapus.</p><p>${FLAGS.robots}</p>`, nav) },
      "/login": login,
    },
  };
}

const flagDone = (id: string) => (ctx: LabContext) => ctx.facts.has(`flag:${id}`);

export const ctfLab: LabDefinition = {
  id: "ctf-mini",
  title: "CTF Mini: ctf.lab",
  summary: "Enam tantangan capture the flag yang menggabungkan Linux, DNS, HTTP, nmap, hash cracking, dan SQL injection.",
  difficulty: "mahir",
  estimatedMinutes: 45,
  xp: 400,
  controllable: ["kali"],
  allowedCommands: [...NET_COMMANDS, ...BASIC_COMMANDS, "nmap", "nc", "curl", "browser", "dig", "nslookup", "host", "base64", "md5sum", "john"],
  flags: CHALLENGES.map((c) => ({ id: c.id, title: c.title, points: c.points, hash: sha256(FLAGS[c.id]) })),
  briefing: [
    "Selamat datang di CTF pertamamu! Semua host di jaringan **10.20.0.0/24** (domain *ctf.lab*) adalah target resmi — kamu boleh menguji apa saja di sana.",
    "Mulailah dengan membaca `~/README.txt`. Setiap flag berbentuk `FLAG{...}` dan dikirim dengan `submit-flag`. Kerjakan dalam urutan apa pun!",
  ],
  topology: {
    devices: [
      {
        id: "kali",
        name: "Laptop Peserta",
        hostname: "kali",
        kind: "attacker",
        position: { x: 0, y: 200 },
        interfaces: [{ name: "eth0", ip: "10.20.0.99/24" }],
        dns: ["10.20.0.53"],
        files: {
          "README.txt": README,
          "bocoran/hash.txt": `admin_lama:${md5("garuda2026")}\n`,
          "/usr/share/wordlists/umum.txt": { content: WORDLIST.join("\n") + "\n", owner: "root", mode: 0o644 },
        },
      },
      { id: "sw", name: "Switch", kind: "switch", position: { x: 240, y: 200 } },
      {
        id: "ns",
        name: "DNS ctf.lab",
        hostname: "ns1",
        kind: "server",
        position: { x: 480, y: 0 },
        interfaces: [{ name: "eth0", ip: "10.20.0.53/24" }],
        dnsServer: {
          records: [
            { name: "portal.ctf.lab", type: "A", value: "10.20.0.80" },
            { name: "files.ctf.lab", type: "A", value: "10.20.0.77" },
            { name: "ctf.lab", type: "NS", value: "ns1.ctf.lab" },
            { name: "ns1.ctf.lab", type: "A", value: "10.20.0.53" },
            { name: "ctf.lab", type: "TXT", value: FLAGS.dns },
          ],
        },
      },
      { id: "portal", name: "portal.ctf.lab", hostname: "portal", kind: "server", position: { x: 480, y: 200 }, interfaces: [{ name: "eth0", ip: "10.20.0.80/24" }], web: portalWeb },
      {
        id: "files",
        name: "files.ctf.lab",
        hostname: "files",
        kind: "server",
        position: { x: 480, y: 400 },
        interfaces: [{ name: "eth0", ip: "10.20.0.77/24" }],
        services: [
          { port: 22, protocol: "tcp", name: "ssh", version: "OpenSSH 9.6p1" },
          { port: 8888, protocol: "tcp", name: "backdoor", banner: `Layanan debug v0.1 -- ${FLAGS.port}` },
        ],
      },
    ],
    links: [
      ["kali:eth0", "sw:p1"],
      ["ns:eth0", "sw:p2"],
      ["portal:eth0", "sw:p3"],
      ["files:eth0", "sw:p4"],
    ],
  },
  objectives: CHALLENGES.map((c) => ({ id: c.id, text: `**${c.title}** (${c.points} poin)`, check: flagDone(c.id) })),
  hints: [
    "Pemanasan: string yang diakhiri `=` hampir pasti Base64. DNS: `dig ctf.lab TXT`.",
    "Jangan Diindeks: baca `robots.txt`. Pintu Belakang: `sudo nmap -p- files.ctf.lab`, lalu sapa port itu dengan `nc`.",
    "Hash Bocor: `john --format=raw-md5 --wordlist=/usr/share/wordlists/umum.txt bocoran/hash.txt`. Admin Tanpa Password: ingat trik komentar `-- ` di Modul 14.",
  ],
};

/** Plain-text flags, exported only for the automated lab test. */
export const CTF_FLAGS_FOR_TESTS = FLAGS;
