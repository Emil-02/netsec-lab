import type { LabDefinition } from "@/engine";
import { has, NET_COMMANDS } from "./helpers";

export const portLab: LabDefinition = {
  id: "port-layanan",
  title: "Port & Layanan",
  summary: "Lihat port yang terbuka dari dalam server, lalu ketuk port-port itu dari luar dengan netcat.",
  difficulty: "pemula",
  estimatedMinutes: 15,
  xp: 100,
  controllable: ["pc", "srv"],
  allowedCommands: [...NET_COMMANDS, "nc", "ss", "netstat", "curl"],
  briefing: [
    "Satu server bisa menjalankan banyak layanan sekaligus: SSH, web, email, database… Setiap layanan \"mendengarkan\" di **nomor port** yang berbeda, seperti nomor kamar di sebuah hotel.",
    "Kamu bisa masuk ke **Server** untuk melihat daftar port dari dalam, dan memakai **PC** untuk mengetuk port-port itu dari luar.",
  ],
  topology: {
    devices: [
      { id: "pc", name: "PC Kamu", hostname: "pc", kind: "pc", position: { x: 0, y: 120 }, interfaces: [{ name: "eth0", ip: "10.0.0.10/24" }], hosts: { srv: "10.0.0.20" } },
      { id: "sw", name: "Switch", kind: "switch", position: { x: 260, y: 120 } },
      {
        id: "srv",
        name: "Server",
        hostname: "srv",
        kind: "server",
        position: { x: 520, y: 120 },
        interfaces: [{ name: "eth0", ip: "10.0.0.20/24" }],
        services: [
          { port: 22, protocol: "tcp", name: "sshd", banner: "SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13" },
          { port: 25, protocol: "tcp", name: "postfix", banner: "220 mail.lab ESMTP Postfix (Ubuntu)" },
          { port: 3306, protocol: "tcp", name: "mysqld", bind: "127.0.0.1" },
          { port: 123, protocol: "udp", name: "ntpd" },
        ],
        web: { software: "Apache/2.4.58 (Ubuntu)", routes: { "/": { body: "<h1>It works!</h1>\n" } } },
      },
    ],
    links: [
      ["pc:eth0", "sw:p1"],
      ["srv:eth0", "sw:p2"],
    ],
  },
  objectives: [
    { id: "ss", text: "Pindah ke **Server**, lalu lihat port yang listening: `ss -tuln`", check: has("ss:viewed:srv") },
    { id: "ssh", text: "Dari **PC**, cek apakah port 22 (SSH) terbuka: `nc -zv srv 22`", check: has("nc:open:10.0.0.20:22") },
    { id: "banner", text: "Ambil *banner* SSH untuk tahu versi software-nya: `nc srv 22`", check: has("nc:banner:10.0.0.20:22") },
    { id: "closed", text: "Coba port 23 (telnet) — port tertutup akan menolak koneksi", check: has("nc:refused:10.0.0.20:23") },
    { id: "local", text: "Coba port 3306 (MySQL). Di server ia listening, tapi dari PC ditolak. Kenapa?", check: has("nc:refused:10.0.0.20:3306") },
    { id: "scan", text: "Scan rentang port 20–30 sekaligus (`nc -zv srv 20-30`) dan temukan layanan email (SMTP)", check: has("nc:open:10.0.0.20:25") },
  ],
  hints: [
    "Pada output `ss`, kolom Local Address `0.0.0.0:22` berarti mendengarkan di semua interface, sedangkan `127.0.0.1:3306` hanya bisa diakses dari server itu sendiri.",
    "`nc -z` = hanya cek terbuka/tidak (zero I/O), `-v` = tampilkan hasilnya.",
    "Banner sering membocorkan versi software. Penyerang memakainya untuk mencari celah yang cocok — itu sebabnya admin sering menyembunyikan banner.",
  ],
};

export const tcpHandshakeLab: LabDefinition = {
  id: "tcp-handshake",
  title: "Membedah TCP Handshake",
  summary: "Request sebuah halaman web dan bedah setiap segmen TCP-nya: SYN, SYN-ACK, ACK, data, FIN, dan RST.",
  difficulty: "pemula",
  estimatedMinutes: 15,
  xp: 110,
  controllable: ["pc"],
  allowedCommands: [...NET_COMMANDS, "nc", "curl"],
  briefing: [
    "Sebelum mengirim data, TCP selalu \"berjabat tangan\" dulu untuk memastikan kedua pihak siap. Setelah selesai, koneksi ditutup dengan sopan.",
    "Kirim request ke web server, lalu bedah paket-paketnya satu per satu di panel Paket. Atur kecepatan ke 0.5× agar mudah diikuti.",
  ],
  topology: {
    devices: [
      { id: "pc", name: "PC Kamu", hostname: "pc", kind: "pc", position: { x: 0, y: 120 }, interfaces: [{ name: "eth0", ip: "10.0.0.10/24" }], hosts: { "web.lab": "10.0.0.80" } },
      { id: "sw", name: "Switch", kind: "switch", position: { x: 260, y: 120 } },
      {
        id: "web",
        name: "Web Server",
        hostname: "web",
        kind: "server",
        position: { x: 520, y: 120 },
        interfaces: [{ name: "eth0", ip: "10.0.0.80/24" }],
        web: { routes: { "/": { body: "<h1>Selamat datang di web.lab</h1>\n" } } },
      },
    ],
    links: [
      ["pc:eth0", "sw:p1"],
      ["web:eth0", "sw:p2"],
    ],
  },
  objectives: [
    { id: "curl", text: "Ambil halaman web: `curl http://web.lab`", check: has("curl:ok:web.lab/") },
    { id: "syn", text: "Klik segmen **SYN** — PC meminta membuka koneksi ke port 80", check: has("ui:inspect:tcp:SYN") },
    { id: "synack", text: "Klik segmen **SYN, ACK** — server setuju", check: has("ui:inspect:tcp:SYN+ACK") },
    { id: "data", text: "Klik segmen yang membawa data **HTTP** (flag PSH, ACK) dan baca isinya", check: has("ui:inspect:HTTP") },
    { id: "fin", text: "Klik segmen **FIN, ACK** — koneksi ditutup", check: has("ui:inspect:tcp:FIN+ACK") },
    { id: "rst", text: "Coba port yang tertutup (`nc -v web.lab 8080`) lalu klik balasan **RST, ACK**", check: has("ui:inspect:tcp:RST+ACK") },
  ],
  hints: [
    "Di kolom Info panel Paket, flag TCP ditulis dalam kurung siku, misalnya [SYN] atau [SYN, ACK].",
    "Perhatikan nomor Seq/Ack: setiap pihak mengonfirmasi (ACK) data yang sudah diterima dari lawannya.",
    "RST berarti \"tidak ada yang mendengarkan di port ini\" — inilah yang dilihat port scanner saat menemukan port tertutup.",
  ],
};
