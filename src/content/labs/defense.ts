import type { FwRule, LabContext, LabDefinition } from "@/engine";
import { md5 } from "@/engine/crypto/hash";
import { BASIC_COMMANDS, fileAt, has, NET_COMMANDS, recent } from "./helpers";

const USERS: [string, string][] = [
  ["budi", "sayang123"],
  ["sari", "qwerty"],
  ["andi", "T0ko!Buku#Merah-27"],
  ["admin", "admin123"],
  ["rina", "Kucing-Lompat-Pagar-9"],
  ["dodi", "password1"],
];

const WORDLIST = [
  "123456", "password", "123456789", "12345678", "qwerty", "abc123", "password1", "111111", "admin", "admin123",
  "iloveyou", "sayang", "sayang123", "bismillah", "indonesia", "rahasia", "welcome", "letmein", "monkey", "dragon",
  "football", "sunshine", "master", "kucing", "anjing", "garuda", "merdeka", "jakarta", "qwerty123", "1q2w3e4r",
];

export const hashCrackLab: LabDefinition = {
  id: "audit-password",
  title: "Audit Kekuatan Password",
  summary: "Database lama bocor dan menyimpan password sebagai MD5 tanpa salt. Uji hash mana yang lemah dengan dictionary attack.",
  difficulty: "menengah",
  estimatedMinutes: 15,
  xp: 140,
  controllable: ["pc"],
  allowedCommands: [...BASIC_COMMANDS, "john", "md5sum", "sha256sum"],
  briefing: [
    "Sebuah backup database lama ditemukan di server publik. Isinya username dan password yang di-hash dengan **MD5 tanpa salt**. Sebagai tim keamanan, kamu harus tahu akun mana yang passwordnya lemah agar pemiliknya segera diminta mengganti.",
    "Gunakan daftar password yang paling sering dipakai (`/usr/share/wordlists/umum.txt`) untuk menguji hash tersebut.",
  ],
  topology: {
    devices: [
      {
        id: "pc",
        name: "PC Tim Keamanan",
        hostname: "secteam",
        kind: "pc",
        position: { x: 0, y: 0 },
        interfaces: [{ name: "eth0", ip: "10.0.0.10/24" }],
        files: {
          "bocoran/users.txt": USERS.map(([u, p]) => `${u}:${md5(p)}`).join("\n") + "\n",
          "/usr/share/wordlists/umum.txt": { content: WORDLIST.join("\n") + "\n", owner: "root", mode: 0o644 },
        },
      },
    ],
    links: [],
  },
  objectives: [
    { id: "look", text: "Lihat isi `bocoran/users.txt`. Hash 32 karakter heksadesimal = MD5", check: has("cat:/home/siswa/bocoran/users.txt") },
    { id: "same", text: "Hitung MD5 dari `sayang123` (`echo -n sayang123 | md5sum`) dan cocokkan dengan hash milik budi", check: has("md5sum:stdin") },
    { id: "john", text: "Jalankan dictionary attack: `john --format=raw-md5 --wordlist=/usr/share/wordlists/umum.txt bocoran/users.txt`", check: has("john:run") },
    { id: "show", text: "Tampilkan semua hasil dengan `john --show bocoran/users.txt`", check: has("john:show") },
    {
      id: "report",
      text: "Tulis username yang **wajib ganti password** ke `~/wajib-ganti.txt` (satu per baris, tanpa password)",
      check: (ctx) => {
        const f = fileAt(ctx, "pc", "/home/siswa/wajib-ganti.txt");
        if (f?.type !== "file") return false;
        const lines = f.content.toLowerCase();
        const weak = ["budi", "sari", "admin", "dodi"];
        const leaked = USERS.some(([, p]) => lines.includes(p.toLowerCase()));
        return weak.every((u) => lines.includes(u)) && !lines.includes("andi") && !lines.includes("rina") && !leaked;
      },
    },
  ],
  hints: [
    "MD5 tanpa salt selalu menghasilkan hash yang sama untuk password yang sama. Penyerang cukup menghitung hash dari daftar kata lalu mencocokkan.",
    "Lihat baris hasil john: format `password (username)`. Akun andi dan rina memakai passphrase panjang & unik sehingga tidak ada di wordlist.",
    "Contoh laporan: `echo budi > ~/wajib-ganti.txt` lalu `echo sari >> ~/wajib-ganti.txt` dan seterusnya.",
  ],
};

const SRV = "10.0.0.20";

function inputRules(ctx: LabContext): FwRule[] {
  return ctx.net.device("srv").firewall.chains.INPUT.rules.filter((r) => r.target === "ACCEPT");
}

export const firewallLab: LabDefinition = {
  id: "firewall-server",
  title: "Mengamankan Server dengan iptables",
  summary: "Server web ini membuka terlalu banyak port. Terapkan prinsip default deny: tolak semua, izinkan hanya yang perlu.",
  difficulty: "mahir",
  estimatedMinutes: 25,
  xp: 200,
  controllable: ["srv", "luar", "admin"],
  allowedCommands: [...NET_COMMANDS, "iptables", "nmap", "nc", "curl", "ss"],
  briefing: [
    "Server **srv** (10.0.0.20) menjalankan web (80), SSH (22), dan database MySQL (3306). Database tidak seharusnya bisa diakses dari luar, dan SSH hanya boleh dari PC admin (10.0.0.5).",
    "Kamu bisa mengendalikan server (sebagai root), komputer orang luar, dan PC admin. Lakukan scan sebelum dan sesudah memasang firewall untuk membuktikan hasilnya.",
  ],
  topology: {
    devices: [
      { id: "admin", name: "PC Admin", hostname: "admin-pc", kind: "pc", position: { x: 0, y: 40 }, interfaces: [{ name: "eth0", ip: "10.0.0.5/24" }] },
      { id: "luar", name: "Orang Luar", hostname: "luar", kind: "attacker", position: { x: 0, y: 280 }, interfaces: [{ name: "eth0", ip: "10.0.0.66/24" }] },
      { id: "sw", name: "Switch", kind: "switch", position: { x: 240, y: 160 } },
      {
        id: "srv",
        name: "Server srv",
        hostname: "srv",
        kind: "server",
        user: "root",
        position: { x: 480, y: 160 },
        interfaces: [{ name: "eth0", ip: `${SRV}/24` }],
        services: [
          { port: 22, protocol: "tcp", name: "ssh", version: "OpenSSH 9.6p1 Ubuntu 3ubuntu13" },
          { port: 3306, protocol: "tcp", name: "mysql", version: "MySQL 8.0.36" },
        ],
        web: { software: "nginx/1.24.0", routes: { "/": { body: "<h1>Toko Online</h1>\n" } } },
      },
    ],
    links: [
      ["admin:eth0", "sw:p1"],
      ["luar:eth0", "sw:p2"],
      ["srv:eth0", "sw:p3"],
    ],
  },
  objectives: [
    { id: "before", text: "Dari **Orang Luar**, scan server: `sudo nmap 10.0.0.20`. Database 3306 terbuka untuk umum!", check: has(`nmap:open:${SRV}:3306`) },
    {
      id: "established",
      text: "Di **Server**, izinkan balasan koneksi yang sudah terjalin: `iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT`",
      check: (ctx) => inputRules(ctx).some((r) => r.states?.includes("ESTABLISHED") && !r.dport),
    },
    { id: "http", text: "Izinkan web untuk semua orang: `iptables -A INPUT -p tcp --dport 80 -j ACCEPT`", check: (ctx) => inputRules(ctx).some((r) => r.dport === 80 && !r.src) },
    {
      id: "ssh",
      text: "Izinkan SSH **hanya** dari PC admin: `iptables -A INPUT -p tcp --dport 22 -s 10.0.0.5 -j ACCEPT`",
      check: (ctx) => inputRules(ctx).some((r) => r.dport === 22 && r.src?.ip === "10.0.0.5" && r.src.prefix === 32),
    },
    { id: "policy", text: "Terapkan default deny: `iptables -P INPUT DROP`", check: (ctx) => ctx.net.device("srv").firewall.chains.INPUT.policy === "DROP" },
    {
      id: "after",
      text: "Dari Orang Luar, scan lagi: web masih **open**, SSH & MySQL sekarang **filtered**",
      requires: ["policy"],
      check: (ctx) => ctx.recent.has(`nmap:open:${SRV}:80`) && !ctx.recent.has(`nmap:open:${SRV}:3306`) && !ctx.recent.has(`nmap:open:${SRV}:22`),
    },
    { id: "admin", text: "Dari **PC Admin**, pastikan SSH tetap bisa: `nc -zv 10.0.0.20 22`", requires: ["policy"], check: recent(`nc:open:${SRV}:22`) },
    { id: "list", text: "Di server, lihat aturan beserta penghitung paketnya: `iptables -L -n -v`", requires: ["policy"], check: recent("iptables:listed:srv") },
  ],
  hints: [
    "Urutan penting! Pasang aturan ACCEPT dulu, baru ubah policy ke DROP. Kalau terbalik di server sungguhan lewat SSH, kamu bisa mengunci diri sendiri.",
    "Tanpa aturan ESTABLISHED,RELATED, server tidak bisa menerima balasan dari koneksi yang ia buat sendiri (misalnya update software).",
    "Port yang di-DROP tampil sebagai `filtered` di nmap: tidak ada jawaban sama sekali, beda dengan `closed` yang dibalas RST.",
  ],
};

const ATTACKER = "203.0.113.66";

function authLog() {
  const lines: string[] = [];
  let pid = 4100;
  const add = (time: string, msg: string) => lines.push(`Nov 16 ${time} srv sshd[${pid++}]: ${msg}`);
  add("08:12:01", "Accepted password for admin from 10.0.0.5 port 50122 ssh2");
  const users = ["root", "admin", "test", "oracle", "ubuntu", "user", "postgres", "git", "root", "admin"];
  for (let i = 0; i < 46; i++) {
    const s = 10 + Math.floor(i / 2);
    add(`09:${String(s).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`, `Failed password for ${i % 5 === 3 ? "invalid user " : ""}${users[i % users.length]} from ${ATTACKER} port ${40100 + i * 2} ssh2`);
  }
  add("09:40:13", "Failed password for admin from 10.0.0.5 port 50388 ssh2");
  add("09:40:20", "Accepted password for admin from 10.0.0.5 port 50390 ssh2");
  return lines.join("\n") + "\n";
}

function blockRule(ctx: LabContext) {
  return ctx.net.device("srv").firewall.chains.INPUT.rules.findIndex((r) => r.src?.ip === ATTACKER && (r.target === "DROP" || r.target === "REJECT"));
}

export const incidentLab: LabDefinition = {
  id: "respons-insiden",
  title: "Respons Insiden: Hentikan Brute Force",
  summary: "Log menunjukkan puluhan percobaan login gagal dari satu IP. Analisis log, blokir penyerang, dan catat setiap upaya berikutnya.",
  difficulty: "mahir",
  estimatedMinutes: 20,
  xp: 180,
  controllable: ["srv", "penyerang"],
  allowedCommands: [...NET_COMMANDS, "iptables", "nc", "nmap"],
  briefing: [
    "Pukul 09.45, sistem monitoring berbunyi: beban CPU server SSH melonjak. Kemungkinan besar sedang terjadi serangan **brute force** — menebak password berulang-ulang.",
    "Kamu adalah admin server (root). Baca `/var/log/auth.log`, temukan sumber serangan, lalu blokir dengan firewall. Perangkat **Penyerang** disediakan agar kamu bisa menguji blokirannya.",
  ],
  topology: {
    devices: [
      {
        id: "srv",
        name: "Server SSH",
        hostname: "srv",
        kind: "server",
        user: "root",
        position: { x: 0, y: 120 },
        interfaces: [{ name: "eth0", ip: "10.0.0.20/24" }],
        gateway: "10.0.0.1",
        services: [{ port: 22, protocol: "tcp", name: "ssh" }],
        files: { "/var/log/auth.log": { content: authLog(), owner: "root", mode: 0o640 } },
      },
      {
        id: "r1",
        name: "Router",
        hostname: "router",
        kind: "router",
        position: { x: 260, y: 120 },
        interfaces: [
          { name: "eth0", ip: "10.0.0.1/24" },
          { name: "eth1", ip: "203.0.113.1/24" },
        ],
      },
      { id: "penyerang", name: "Penyerang", hostname: "bot", kind: "attacker", position: { x: 520, y: 120 }, interfaces: [{ name: "eth0", ip: `${ATTACKER}/24` }], gateway: "203.0.113.1" },
    ],
    links: [
      ["srv:eth0", "r1:eth0"],
      ["r1:eth1", "penyerang:eth0"],
    ],
  },
  objectives: [
    { id: "count", text: "Hitung jumlah login gagal: `grep Failed /var/log/auth.log | wc -l`", check: (ctx) => ctx.facts.has("cmd:grep") && ctx.facts.has("cmd:wc") },
    { id: "source", text: `Temukan IP penyerang (petunjuk: \`grep ${"Failed"} /var/log/auth.log | tail\`)`, check: (ctx) => ctx.facts.has("cmd:tail") || ctx.facts.has("cmd:head") || ctx.facts.has("cat:/var/log/auth.log") },
    {
      id: "test",
      text: "Dari **Penyerang**, uji akses ke SSH server: `nc -zv 10.0.0.20 22` (idealnya **sebelum** memblokir, agar kamu tahu perbedaannya)",
      check: (ctx) => ctx.facts.has("nc:open:10.0.0.20:22") || ctx.facts.has("nc:failed:10.0.0.20:22"),
    },
    { id: "block", text: "Di server, blokir IP penyerang: `iptables -A INPUT -s <IP> -j DROP`", check: (ctx) => blockRule(ctx) >= 0 },
    {
      id: "log",
      text: 'Catat upaya yang diblokir: sisipkan aturan LOG **di atas** aturan DROP: `iptables -I INPUT 1 -s <IP> -j LOG --log-prefix "DIBLOKIR: "`',
      check: (ctx) => {
        const rules = ctx.net.device("srv").firewall.chains.INPUT.rules;
        const logIdx = rules.findIndex((r) => r.target === "LOG" && r.src?.ip === ATTACKER);
        const drop = blockRule(ctx);
        return logIdx >= 0 && drop >= 0 && logIdx < drop;
      },
    },
    { id: "verify", text: "Dari Penyerang, coba lagi `nc -zv 10.0.0.20 22` — sekarang harus *timed out*", requires: ["block"], check: recent("nc:failed:10.0.0.20:22") },
    { id: "evidence", text: "Di server, buktikan upaya itu tercatat: `cat /var/log/kern.log`", requires: ["log", "verify"], check: recent("cat:/var/log/kern.log") },
  ],
  hints: [
    "Satu IP yang muncul puluhan kali dengan berbagai username (root, admin, test, oracle…) adalah ciri khas serangan brute force otomatis.",
    "Aturan iptables dicek dari atas ke bawah. Jika LOG ditaruh setelah DROP, paket sudah dibuang sebelum sempat dicatat.",
    "Di dunia nyata, tool seperti **fail2ban** melakukan langkah ini otomatis: membaca log lalu memblokir IP yang gagal login berkali-kali.",
  ],
};
